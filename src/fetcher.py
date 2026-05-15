import sys
import json
import requests
import warnings

# Tắt cảnh báo và ép dùng UTF-8 cho Windows
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

def fetch_data(ticker):
    ticker = ticker.upper()
    result = {
        "ticker": ticker,
        "fullName": f"Công ty {ticker}",
        "industry": "Đang cập nhật...",
        "overview": "Chưa có thông tin mô tả chi tiết.",
        "marketCap": "---",
        "peRatio": "---",
        "establishedDate": "---"
    }

    # Giả lập trình duyệt xịn để vượt tường lửa SSI
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }

    try:
        # ==========================================
        # 1. KÉO HỒ SƠ TỪ KHÔNG GIAN NGẦM CỦA SSI
        # ==========================================
        ssi_profile_url = f"https://fiin-core.ssi.com.vn/Master/GetCompanyInfo?language=vi&Ticker={ticker}"
        res_profile = requests.get(ssi_profile_url, headers=headers, timeout=5).json()
        
        if res_profile.get('items') and len(res_profile['items']) > 0:
            item = res_profile['items'][0]
            result['fullName'] = item.get('organName', result['fullName'])
            result['industry'] = item.get('icbName3', result['industry']) # Sẽ trả về "Ngân hàng" chứ không phải 8355
            result['overview'] = item.get('profile', result['overview'])
            if item.get('foundDate'):
                result['establishedDate'] = item['foundDate'][-4:] # Lấy 4 số cuối là Năm

        # ==========================================
        # 2. KÉO CHỈ SỐ TÀI CHÍNH TỪ SSI
        # ==========================================
        ssi_ratio_url = f"https://fiin-fundamental.ssi.com.vn/FinancialAnalysis/GetFinancialRatio?language=vi&Ticker={ticker}"
        res_ratio = requests.get(ssi_ratio_url, headers=headers, timeout=5).json()
        
        if res_ratio.get('items') and len(res_ratio['items']) > 0:
            item = res_ratio['items'][0]
            if item.get('pe'):
                result['peRatio'] = str(round(float(item['pe']), 2))
            if item.get('marketCap'):
                mc = float(item['marketCap'])
                result['marketCap'] = f"{mc / 1000000000:,.0f} Tỷ"
                
    except Exception as e:
        pass # Lỗi thì giữ nguyên format mặc định

    # TRẢ KẾT QUẢ SẠCH CHO NODE.JS
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fetch_data(sys.argv[1])
    else:
        print(json.dumps({"error": "Thiếu mã cổ phiếu!"}))