import os
import json
import asyncio
import httpx
from dotenv import load_dotenv
from telethon import TelegramClient, events, errors
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.messages import GetDialogsRequest
from telethon.tl.types import InputPeerEmpty

# ── Tự động chọn SDK Gemini đúng (mới hoặc cũ) ────────────────────────────────
try:
    import google.genai as genai_new
    from google.genai import types as genai_types
    _USE_NEW_SDK = True
except ImportError:
    import google.generativeai as genai_old
    _USE_NEW_SDK = False

# --- CẤU HÌNH ------------------------------------------------------------------

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

API_ID          = os.getenv('TELEGRAM_API_ID')
API_HASH        = os.getenv('TELEGRAM_API_HASH')
SESSION_NAME    = 'omni_duck_signal_listener'
GEMINI_API_KEY  = os.getenv('GEMINI_API_KEY_MAIN')
NODE_SECRET_KEY = os.getenv('EXTERNAL_SIGNAL_SECRET')

# ==============================================================================
# >> ĐÂY LÀ NƠI BẠN THÊM ID CÁC KÊNH/NHÓM TELEGRAM CẦN THEO DÕI <<
# ==============================================================================
TARGET_CHAT_IDS = [
    'chungkhoanUG',
    'fantom_signal',
    'ByBit_OKX_Bitget',
    'Captain_kw',

    ]
NODE_BACKEND_ENDPOINT = 'http://localhost:3001/api/v1/signals/external'

# --- KIỂM TRA BIẾN MÔI TRƯỜNG -------------------------------------------------

missing = [k for k, v in {
    'TELEGRAM_API_ID':        API_ID,
    'TELEGRAM_API_HASH':      API_HASH,
    'GEMINI_API_KEY_MAIN':    GEMINI_API_KEY,
    'EXTERNAL_SIGNAL_SECRET': NODE_SECRET_KEY,
}.items() if not v]

if missing:
    print(f"[LỖI] Thiếu biến môi trường: {', '.join(missing)}")
    exit(1)

# --- KHỞI TẠO GEMINI -----------------------------------------------------------

if _USE_NEW_SDK:
    print("[Gemini] Dùng SDK mới: google-genai ✅")
    _gemini_client = genai_new.Client(api_key=GEMINI_API_KEY)
    _gen_config    = genai_types.GenerateContentConfig(
        temperature=0.2,
        top_p=1.0,
        top_k=1,
        max_output_tokens=2048,
        response_mime_type="application/json",
    )
    _GEMINI_MODEL = "gemini-2.0-flash"
else:
    print("[Gemini] Dùng SDK cũ (fallback): google-generativeai ⚠️")
    print("         Hãy chạy: pip uninstall google-generativeai -y && pip install google-genai")
    genai_old.configure(api_key=GEMINI_API_KEY)
    _gemini_old_model = genai_old.GenerativeModel(
        model_name="gemini-1.5-flash",
        generation_config={
            "temperature": 0.2,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
            "response_mime_type": "application/json",
        },
    )

# --- WARM-UP: NẠP ENTITY VÀO CACHE TELETHON ------------------------------------

async def warmup_entity_cache(client: TelegramClient) -> dict:
    """
    Vấn đề: Telethon dùng SQLite cache để tra cứu entity theo ID số.
    Nếu session mới hoặc kênh chưa từng load, get_entity(id) sẽ lỗi
    "Could not find the input entity".

    Giải pháp: Gọi GetDialogs để Telethon tự nạp toàn bộ danh sách
    chat/channel vào cache, SAU ĐÓ get_entity mới hoạt động được.

    Trả về dict {chat_id: entity} cho các kênh trong TARGET_CHAT_IDS.
    """
    print("\n[Cache] Đang nạp danh sách hội thoại vào cache Telethon...")

    # Lấy tối đa 500 dialog gần nhất — đủ để nạp cache cho hầu hết tài khoản
    # Nếu tài khoản có rất nhiều chat, tăng limit lên 1000
    await client(GetDialogsRequest(
        offset_date=None,
        offset_id=0,
        offset_peer=InputPeerEmpty(),
        limit=500,
        hash=0,
    ))
    print("[Cache] ✅ Đã nạp dialog cache xong.")

    # Thử resolve từng target ID sau khi cache đã có
    print("\n[Chẩn đoán] Kiểm tra các kênh đang theo dõi:")
    resolved = {}
    for cid in TARGET_CHAT_IDS:
        try:
            entity = await client.get_entity(cid)
            name = getattr(entity, 'title', getattr(entity, 'username', str(cid)))
            resolved[cid] = entity
            print(f"  ✅  {cid}  →  {name!r}")
        except Exception:
            # Thử lần 2: dùng GetFullChannelRequest với raw peer
            # (hoạt động với kênh public hoặc kênh bạn đã join nhưng cache lỡ miss)
            try:
                from telethon.tl.types import PeerChannel
                # strip prefix -100 để lấy channel_id thuần
                raw_id = abs(cid)
                if str(raw_id).startswith('100'):
                    raw_id = int(str(raw_id)[3:])
                full = await client(GetFullChannelRequest(PeerChannel(raw_id)))
                entity = full.chats[0]
                name = getattr(entity, 'title', str(cid))
                resolved[cid] = entity
                print(f"  ✅  {cid}  →  {name!r}  (resolved via GetFullChannel)")
            except Exception as e2:
                print(f"  ❌  {cid}  →  Không resolve được: {e2}")
                print(f"      ⚠️  Hãy đảm bảo tài khoản Telegram đã JOIN kênh này!")

    ok_count = len(resolved)
    fail_count = len(TARGET_CHAT_IDS) - ok_count
    print(f"\n[Cache] Kết quả: {ok_count} kênh OK, {fail_count} kênh lỗi.")
    if fail_count > 0:
        print("[Cache] Các kênh lỗi sẽ bị BỎ QUA khi lắng nghe.")
        print("[Cache] → Kiểm tra: tài khoản có join kênh đó chưa?")
        print("[Cache] → Nếu là kênh private, bạn cần được mời vào.")

    return resolved


# --- BỘ PHÂN TÍCH TIN NHẮN BẰNG AI --------------------------------------------

_PROMPT_TEMPLATE = """
Analyze the following message from a trading/investment channel.
Determine if it contains an actionable trading signal (BUY/SELL/LONG/SHORT/MUA/BÁN).

Rules:
- Symbol: normalize to standard form (e.g. BTC/USDT, HPG, VN30F1M).
  For Vietnamese stocks just use the ticker (e.g. "HPG", "VCB").
- Direction: MUST be exactly "LONG" or "SHORT".
  BUY/MUA = LONG, SELL/BÁN = SHORT.
- Entry: first entry price as string, or "market" if immediate buy/sell.
- TakeProfit: array of TP price strings. Empty array [] if none.
- StopLoss: SL price string, or null if none mentioned.
- Only set is_signal=true for clear actionable signals, not analysis/news.

Message:
---
{message_text}
---

Return ONLY valid JSON, no markdown, no explanation:
{{
  "is_signal": true,
  "symbol": "BTC/USDT",
  "direction": "LONG",
  "entry": "68500",
  "take_profit": ["70000", "72000"],
  "stop_loss": "67000",
  "original_message": "{safe_preview}"
}}

Or if NOT a signal:
{{
  "is_signal": false
}}
"""

def _clean_json_text(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()

async def parse_message_with_ai(message_text: str) -> dict:
    if not message_text or not message_text.strip():
        return {"is_signal": False}

    safe_preview = message_text[:200].replace('"', "'").replace('\n', ' ')
    prompt = _PROMPT_TEMPLATE.format(
        message_text=message_text,
        safe_preview=safe_preview,
    )

    raw_text = ""
    try:
        if _USE_NEW_SDK:
            response = await asyncio.to_thread(
                _gemini_client.models.generate_content,
                model=_GEMINI_MODEL,
                contents=prompt,
                config=_gen_config,
            )
            raw_text = response.text
        else:
            response = await _gemini_old_model.generate_content_async(prompt)
            raw_text = response.text

        return json.loads(_clean_json_text(raw_text))

    except json.JSONDecodeError as e:
        print(f"  [AI] Lỗi parse JSON: {e} | Raw: {raw_text[:200]!r}")
        return {"is_signal": False}
    except Exception as e:
        print(f"  [AI] Lỗi gọi Gemini: {type(e).__name__}: {e}")
        return {"is_signal": False}


# --- FORWARD TÍN HIỆU TỚI BACKEND ---------------------------------------------

async def forward_signal(signal: dict, chat_title: str) -> None:
    signal["source_channel"] = chat_title
    headers = {
        "x-signal-secret": NODE_SECRET_KEY,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.post(NODE_BACKEND_ENDPOINT, json=signal, headers=headers)
            resp.raise_for_status()
            print(f"  [→ Backend] Đã gửi tín hiệu. Status: {resp.status_code}")
    except httpx.ConnectError:
        print(f"  [→ Backend] LỖI: Không kết nối được tới {NODE_BACKEND_ENDPOINT}")
        print(f"             (Backend Node.js có đang chạy không?)")
    except httpx.HTTPStatusError as e:
        print(f"  [→ Backend] LỖI HTTP {e.response.status_code}: {e.response.text[:200]}")
    except httpx.RequestError as e:
        print(f"  [→ Backend] LỖI request: {e}")


# --- CLIENT TELEGRAM -----------------------------------------------------------

client = TelegramClient(SESSION_NAME, int(API_ID), API_HASH)

@client.on(events.NewMessage(chats=TARGET_CHAT_IDS))
async def handler(event):
    message = event.message

    if not message.text or not message.text.strip():
        return

    try:
        chat = await event.get_chat()
        chat_title = getattr(chat, 'title', str(event.chat_id))
    except Exception:
        chat_title = str(event.chat_id)

    preview = message.text[:80].replace('\n', ' ')
    print(f"\n[TG] '{chat_title}' | {preview!r}...")

    parsed = await parse_message_with_ai(message.text)

    if parsed and parsed.get("is_signal"):
        direction = parsed.get("direction", "?")
        symbol    = parsed.get("symbol", "?")
        entry     = parsed.get("entry", "?")
        print(f"  [AI] ✅ Tín hiệu: {direction} {symbol} @ {entry}")
        print(f"       TP: {parsed.get('take_profit', [])} | SL: {parsed.get('stop_loss', 'N/A')}")
        await forward_signal(parsed, chat_title)
    else:
        print(f"  [AI] ➖ Không phải tín hiệu giao dịch.")


# --- ENTRY POINT ---------------------------------------------------------------

async def main():
    if not TARGET_CHAT_IDS:
        print("[CẢNH BÁO] TARGET_CHAT_IDS rỗng — gateway chạy nhưng không theo dõi kênh nào.")

    print("=" * 60)
    print("  OMNI DUCK — Telegram Signal Gateway")
    print(f"  Lắng nghe {len(TARGET_CHAT_IDS)} kênh/nhóm")
    print(f"  Backend: {NODE_BACKEND_ENDPOINT}")
    print("=" * 60)

    try:
        await client.start()

        # Nạp cache TRƯỚC rồi mới bắt đầu lắng nghe
        await warmup_entity_cache(client)

        print("\n[Gateway] Sẵn sàng nhận tín hiệu. Nhấn Ctrl+C để dừng.\n")
        await client.run_until_disconnected()

    except errors.PhoneNumberInvalidError:
        print("\n[LỖI] Số điện thoại không hợp lệ. Dùng định dạng quốc tế: +84912345678")
    except Exception as e:
        print(f"\n[LỖI KHÔNG XÁC ĐỊNH] {type(e).__name__}: {e}")
    finally:
        if client.is_connected():
            await client.disconnect()


if __name__ == '__main__':
    import sys

    # Fix Ctrl+C trên Windows: ProactorEventLoop (mặc định Python 3.8+) không
    # handle KeyboardInterrupt tốt với Telethon. Dùng SelectorEventLoop thay thế.
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    try:
        with client:
            client.loop.run_until_complete(main())
    except KeyboardInterrupt:
        print("\n[Gateway] Đã dừng (Ctrl+C).")
    except Exception as e:
        print(f"\n[Gateway] Dừng do lỗi: {e}")