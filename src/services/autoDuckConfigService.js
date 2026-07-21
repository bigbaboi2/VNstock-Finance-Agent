
import Setting from '../../models/Setting.js';

export const SETTING_PREFIX = 'autoduckEnv.';

/** @typedef {'number'|'boolean'|'string'} ConfigType */
/** @typedef {'safety'|'idle'|'quality'|'short_fill'|'advanced'|'audit'} ConfigGroup */

/**
 * @type {Record<string, {
 *   type: ConfigType,
 *   default: number|boolean|string,
 *   group: ConfigGroup,
 *   label: string,
 *   help: string,
 *   example: string,
 * }>}
 */
export const AUTODUCK_CONFIG_SCHEMA = {
    MAX_LIVE_ORDER_VALUE_USDT: {
        type: 'number',
        default: 10000,
        group: 'safety',
        label: 'Giá trị lệnh tối đa (USDT)',
        help: 'Trần giá trị một lệnh thực trên sàn. Tăng = cho phép lệnh lớn hơn (rủi ro vốn cao hơn). Giảm = an toàn hơn, lệnh quá to sẽ bị từ chối.',
        example: 'Mặc định: 10000. Tăng 20000 nếu chấp nhận lệnh lớn; giảm 3000 để siết chặt.',
        note: 'Lệnh thực (Live): lệnh đặt thật trên sàn qua kết nối broker. Khác lệnh mô phỏng.',
        badge: 'live',
        hintKind: 'default',
    },
    MAX_LIVE_ORDERS_PER_USER: {
        type: 'number',
        default: 5,
        group: 'safety',
        label: 'Số lệnh đồng thời mỗi người',
        help: 'Số lệnh thực đang mở tối đa mỗi tài khoản. Tăng = nhiều vị thế hơn (tổng rủi ro lớn). Giảm = ít lệnh hơn, dễ kiểm soát.',
        example: 'Mặc định: 5. Tăng 8 nếu muốn nhiều lệnh song song; giảm 2-3 để thận trọng.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_FAST_SCAN_MS: {
        type: 'number',
        default: 180000,
        group: 'idle',
        label: 'Chu kỳ quét khi thiếu lệnh (ms)',
        help: 'Khoảng cách timer khi bot đang thiếu lệnh mở. Tăng = quét thưa hơn (nhẹ máy). Giảm = quét dày hơn. Đổi chu kỳ timer thường cần khởi động lại backend.',
        example: 'Mặc định: 180000 (= 3 phút). 60000 = 1 phút; 300000 = 5 phút.',
        note: 'Thiếu lệnh (idle): chế độ quét nhanh khi số vị thế mở còn thấp so với mục tiêu.',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_RELAX_TARGETS: {
        type: 'string',
        default: '1,3,5',
        group: 'idle',
        label: 'Mức số lệnh mở để kích hoạt nới điểm',
        help: 'Bot muốn luôn có “đủ” lệnh mở. Danh sách này là các mốc số lệnh (cách nhau bằng dấu phẩy). Khi số lệnh đang mở thấp hơn mốc đang dùng, bot coi là thiếu lệnh và nới điểm để dễ vào thêm. Ví dụ danh sách 1,3,5 → bot lần lượt nhắm tới khoảng 1, rồi 3, rồi 5 lệnh mở (tùy giới hạn gói cho phép).',
        example: 'Mặc định: 1,3,5. Muốn bot cố mở nhiều lệnh hơn: 2,4,6. Muốn ít nới / ít ép lệnh: 1,2.',
        note: 'Ví dụ đơn giản: bạn đang mở 0 lệnh, danh sách 1,3,5 → bot thấy chưa đủ → nới điểm. Khi đã mở đủ 5 lệnh (và giới hạn cho phép ≥ 5) thì thôi nới vì đã đạt mốc.',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_RELAX_STEP_SCORE: {
        type: 'number',
        default: 3,
        group: 'idle',
        label: 'Bước nới điểm mỗi lần thiếu lệnh',
        help: 'Mỗi lần nới, trừ thêm bao nhiêu điểm khỏi ngưỡng mô phỏng. Tăng = nới nhanh, dễ vào lệnh yếu hơn (rủi ro cao). Giảm = nới chậm, chặt hơn.',
        example: 'Mặc định: 3. Tăng 5 = nới mạnh; giảm 1-2 = thận trọng.',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_RELAX_MAX_SCORE: {
        type: 'number',
        default: 6,
        group: 'idle',
        label: 'Nới điểm tối đa',
        help: 'Tổng điểm được trừ tối đa khi thiếu lệnh. Tăng = cho phép hạ sàn điểm nhiều hơn. Giảm = sàn điểm vẫn cao (an toàn hơn).',
        example: 'Mặc định: 6. Tăng 10 nếu muốn nới mạnh; giảm 3 để giữ chất lượng.',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_RELAX_MAX_ATTEMPTS: {
        type: 'number',
        default: 4,
        group: 'idle',
        label: 'Số lần nới tối đa mỗi chuỗi',
        help: 'Số lần nới liên tiếp trước khi dừng. Tăng = thử lâu hơn. Giảm = bỏ cuộc sớm, ít lệnh ép hơn.',
        example: 'Mặc định: 4. Tăng 6-8 khi thị trường đi ngang kéo dài; giảm 2 để ít ép lệnh.',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_MIN_SIM_SCORE: {
        type: 'number',
        default: 68,
        group: 'idle',
        label: 'Điểm tối thiểu khi thiếu lệnh',
        help: 'Sàn điểm mô phỏng dù đang nới. Tăng = khó vào lệnh mô phỏng hơn (an toàn). Giảm = dễ vào hơn (nhiều nhiễu hơn).',
        example: 'Mặc định: 68. Tăng 75 để siết; giảm 60 nếu muốn nhiều lệnh để học.',
        note: 'Cách chấm điểm: hệ thống chấm setup theo chất lượng kỹ thuật, mức đồng thuận chỉ báo và lợi thế. Điểm càng cao = tín hiệu càng mạnh, càng khó vào lệnh.',
        badge: 'sim',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_MIN_LIVE_SCORE: {
        type: 'number',
        default: 80,
        group: 'idle',
        label: 'Điểm tối thiểu khi thiếu lệnh',
        help: 'Sàn điểm lệnh thực khi bot thiếu lệnh. Tăng = khó vào lệnh thực hơn (bảo vệ vốn). Giảm = dễ khớp lệnh thực hơn (rủi ro cao).',
        example: 'Mặc định: 80. Tăng 85-88 nếu đang lỗ lệnh thực; giảm 75 chỉ khi chấp nhận rủi ro.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_AI_PROBE_ENABLED: {
        type: 'boolean',
        default: true,
        group: 'idle',
        label: 'Bật lệnh thăm dò AI khi thiếu lệnh',
        help: 'Khi AI chỉ từ chối nhẹ mà bot thiếu lệnh, có thể vào lệnh thăm dò kích thước nhỏ. Bật = thêm cơ hội học. Tắt = chỉ vào khi AI xác nhận rõ.',
        example: 'Mặc định: bật. Tắt nếu không muốn lệnh thăm dò.',
        note: 'Từ chối mềm: AI chưa thích lệnh nhưng lý do chưa phải cấm cứng (ví dụ thiếu xác nhận phụ). Khác từ chối cứng như ngược xu hướng lớn.',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_AI_PROBE_MIN_SCORE: {
        type: 'number',
        default: 78,
        group: 'idle',
        label: 'Điểm tối thiểu cho lệnh thăm dò AI',
        help: 'Thăm dò chỉ chạy nếu điểm đạt ngưỡng. Tăng = thăm dò hiếm hơn, chất lượng cao hơn. Giảm = thăm dò dễ xảy ra hơn.',
        example: 'Mặc định: 78. Tăng 82 để khắt khe; giảm 72 để thăm dò nhiều hơn.',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_AI_PROBE_SIZE_MULT: {
        type: 'number',
        default: 0.45,
        group: 'idle',
        label: 'Hệ số kích thước lệnh thăm dò',
        help: 'Nhân với vốn lệnh thường (0.45 = 45%). Tăng = thăm dò lớn hơn (rủi ro cao). Giảm = thăm dò nhỏ, an toàn hơn.',
        example: 'Mặc định: 0.45. 0.25 = rất nhỏ; 0.7 = gần lệnh thường (rủi ro cao).',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_IDLE_AI_PROBE_LIVE: {
        type: 'boolean',
        default: false,
        group: 'idle',
        label: 'Cho phép thăm dò trên lệnh thực',
        help: 'Cho lệnh thăm dò nhỏ chạy trên tài khoản thật. Bật = rủi ro tiền thật. Nên tắt trừ khi chủ đích thử lệnh thực nhỏ.',
        example: 'Mặc định: tắt (an toàn). Chỉ bật khi chấp nhận thăm dò bằng tiền thật.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_CRYPTO_VN_CROSS_BIAS: {
        type: 'boolean',
        default: true,
        group: 'quality',
        label: 'Bật lệch điểm từ thị trường VN sang crypto',
        help: 'Cộng hoặc trừ nhẹ điểm crypto theo trạng thái VN. Bật = thêm gợi ý liên thị trường (kèm mức hòa bên cạnh). Tắt = bỏ hẳn ảnh hưởng VN và khóa ô mức hòa.',
        example: 'Mặc định: bật. Tắt nếu chỉ trade crypto thuần.',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_CRYPTO_VN_BREADTH_BLEND: {
        type: 'number',
        default: 0.08,
        group: 'quality',
        label: 'Mức hòa tâm lý chứng khoán VN vào crypto',
        help: 'Trọng số tâm lý VN trộn vào bối cảnh crypto. Chỉ có hiệu lực khi đã bật “Lệch điểm từ thị trường VN sang crypto”. Tăng = crypto bị ảnh hưởng VN mạnh hơn. Giảm về 0 = gần như không hòa.',
        example: 'Mặc định: 0.08. Tăng 0.15 nếu tin tương quan VN-crypto; giảm 0.02 để tách biệt.',
        note: 'Phụ thuộc công tắc bên cạnh: tắt lệch điểm VN → ô này bị khóa và hệ thống bỏ qua.',
        dependsOn: { key: 'AUTODUCK_CRYPTO_VN_CROSS_BIAS', equals: true },
        hintKind: 'default',
    },
    AUTODUCK_CONTEXT_BIAS_MAX: {
        type: 'number',
        default: 6,
        group: 'quality',
        label: 'Mức ưu tiên cho bối cảnh thị trường',
        help: 'Mức ưu tiên cho điểm lệch từ sổ lệnh, funding, tin, VN. Tăng = bối cảnh kéo điểm mạnh hơn. Giảm = kỹ thuật chiếm ưu thế hơn.',
        example: 'Mặc định: 6. Tăng 8-10 nếu muốn tin bối cảnh; giảm 3-4 để kỹ thuật quyết định nhiều hơn.',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_QUALITY_MIN: {
        type: 'number',
        default: 82,
        group: 'quality',
        label: 'Chất lượng tối thiểu',
        help: 'Sàn điểm chất lượng cho lệnh thực. Tăng = ít lệnh thực hơn nhưng sạch hơn (an toàn). Giảm = nhiều lệnh hơn, rủi ro cao hơn.',
        example: 'Mặc định: 82. Tăng 86-88 khi muốn siết lệnh thực; giảm 78 chỉ khi chấp nhận rủi ro.',
        note: 'Chất lượng: điểm tổng hợp độ sạch của setup. Càng cao càng khó vào lệnh.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_SIM_QUALITY_MIN: {
        type: 'number',
        default: 72,
        group: 'quality',
        label: 'Chất lượng tối thiểu',
        help: 'Sàn điểm chất lượng cho lệnh mô phỏng. Tăng = mô phỏng chọn lọc hơn. Giảm = nhiều lệnh học hơn (nhiều nhiễu hơn).',
        example: 'Mặc định: 72. Tăng 78 để mô phỏng sạch hơn; giảm 65 để AI học nhiều mẫu.',
        note: '',
        badge: 'sim',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_CONFLUENCE_MIN: {
        type: 'number',
        default: 3,
        group: 'quality',
        label: 'Đồng thuận tối thiểu',
        help: 'Số chỉ báo kỹ thuật phải cùng hướng. Tăng = khó vào lệnh thực hơn (an toàn). Giảm = dễ vào hơn (rủi ro cao).',
        example: 'Mặc định: 3. Tăng 4 để khắt khe; giảm 2 nếu muốn nhiều lệnh thực.',
        note: 'Đồng thuận: có bao nhiêu tín hiệu cùng ủng hộ hướng lệnh.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_SIM_CONFLUENCE_MIN: {
        type: 'number',
        default: 2,
        group: 'quality',
        label: 'Đồng thuận tối thiểu',
        help: 'Số chỉ báo đồng thuận cho mô phỏng. Tăng = mô phỏng chặt hơn. Giảm = dễ vào lệnh học hơn.',
        example: 'Mặc định: 2. Tăng 3 để gắt; giảm 1 để dễ vào.',
        note: '',
        badge: 'sim',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_EDGE_MIN: {
        type: 'number',
        default: 28,
        group: 'quality',
        label: 'Lợi thế tối thiểu',
        help: 'Ngưỡng lợi thế tối thiểu cho lệnh thực. Tăng = chỉ vào khi lợi thế rõ (an toàn). Giảm = chấp nhận lợi thế yếu hơn (rủi ro cao).',
        example: 'Mặc định: 28. Tăng 32-35 để siết; giảm 22-24 nếu muốn nhiều setup.',
        note: 'Lợi thế: mức đáng vào sau khi cân rủi ro/phần thưởng và bối cảnh.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_SIM_EDGE_MIN: {
        type: 'number',
        default: 22,
        group: 'quality',
        label: 'Lợi thế tối thiểu',
        help: 'Ngưỡng lợi thế cho mô phỏng. Tăng = chọn lọc hơn. Giảm = dễ vào lệnh học hơn.',
        example: 'Mặc định: 22. Tăng 26 để sạch; giảm 18 để đa dạng mẫu.',
        note: '',
        badge: 'sim',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_RISK_OFF_SIZE_MULT: {
        type: 'number',
        default: 0.5,
        group: 'quality',
        label: 'Hệ số kích thước khi crypto rủi ro cao',
        help: 'Khi thị trường crypto đang rủi ro cao, nhân kích thước lệnh mua với số này (không cần bật “Cấm lệnh mua”). 1 = không cắt. 0.5 = còn một nửa. Giảm mạnh hơn (0.3) = an toàn hơn.',
        example: 'Mặc định: 0.5 (nửa kích thước). 0.25 = rất thận trọng; 0.8 = gần như không cắt.',
        note: 'Risk-off (né rủi ro): trạng thái thị trường thiên về tránh rủi ro. Mục này chỉ giảm kích thước, không cấm lệnh.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_RISK_OFF_VETO: {
        type: 'boolean',
        default: false,
        group: 'quality',
        label: 'Cấm lệnh mua khi crypto rủi ro cao',
        help: 'Bật = bỏ qua toàn bộ lệnh mua khi crypto đang rủi ro cao (không vào lệnh mua). Tắt = vẫn cho mua; lúc đó kích thước thường đã bị giảm bởi mục “Hệ số kích thước khi crypto rủi ro cao” ở trên (mặc định còn 50%).',
        example: 'Mặc định: tắt. Bật khi muốn tránh mua hẳn lúc thị trường xấu; để tắt nếu vẫn muốn bắt đáy nhưng với size đã cắt.',
        note: 'Veto (cấm lệnh): chặn hoàn toàn hướng mua. Khác với chỉ giảm kích thước.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_SYMBOL_SOFT_BLOCK: {
        type: 'string',
        default: '',
        group: 'quality',
        label: 'Danh sách mã tạm chặn',
        help: 'Các mã (cách nhau bằng dấu phẩy) không được vào lệnh thực. Thêm mã = chặn mã đó. Để trống = không chặn.',
        example: 'Ví dụ: DEXEUSDT,ETHUSDT. Xóa hết nếu muốn mở lại toàn bộ.',
        note: 'Soft-block (chặn mềm): chỉ chặn lệnh thực các mã trong danh sách, không tắt cả hệ thống.',
        badge: 'live',
        hintKind: 'example',
    },
    AUTODUCK_LIVE_ALLOW_SHORT_CONTINUATION: {
        type: 'boolean',
        default: false,
        group: 'short_fill',
        label: 'Cho phép short continuation',
        help: 'Cho phép kiểu lệnh short theo xu hướng tiếp diễn trên lệnh thực. Bật = thêm short (rủi ro short tăng). Tắt = không dùng setup này trên lệnh thực.',
        example: 'Mặc định: tắt. Chỉ bật khi đã thử kỹ short.',
        note: 'Short: bán trước / đặt lệnh bán (lời khi giá giảm). Thường cần futures và cấu hình short đã bật.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_ALLOW_SHORT_FALLBACK: {
        type: 'boolean',
        default: false,
        group: 'short_fill',
        label: 'Cho phép short dự phòng',
        help: 'Thêm kiểu short chung vào danh sách lệnh thực. Bật = nhiều short hơn (rủi ro cao). Tắt = an toàn hơn với short.',
        example: 'Mặc định: tắt. Bật cùng short futures khi đã sẵn sàng short lệnh thực.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_AUTO_FUTURES_SHORT_ENABLED: {
        type: 'boolean',
        default: false,
        group: 'short_fill',
        label: 'Bật short futures tự động',
        help: 'Cho phép hệ thống đặt short futures. Bật = rủi ro đòn bẩy short. Tắt = short tự động bị chặn.',
        example: 'Mặc định: tắt. Bật khi đã cấu hình futures và chấp nhận short.',
        note: 'Futures: hợp đồng ký quỹ trên sàn crypto, thường dùng để short và đòn bẩy.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_FILL_POLL_MS: {
        type: 'number',
        default: 2000,
        group: 'short_fill',
        label: 'Khoảng hỏi khớp lệnh (ms)',
        help: 'Bao lâu hỏi sàn một lần xem lệnh đã khớp. Tăng = ít gọi API (biết khớp chậm hơn). Giảm = biết khớp nhanh hơn (nhiều request hơn).',
        example: 'Mặc định: 2000. 1000 = phản ứng nhanh; 4000 = nhẹ tải hơn.',
        note: 'Khớp lệnh (fill): sàn xác nhận đã mua/bán được khối lượng.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_FILL_TIMEOUT_MS: {
        type: 'number',
        default: 25000,
        group: 'short_fill',
        label: 'Thời gian chờ khớp lệnh (ms)',
        help: 'Chờ tối đa trước khi coi lệnh chưa khớp. Tăng = chờ lâu hơn. Giảm = thất bại sớm hơn nếu không khớp.',
        example: 'Mặc định: 25000 (= 25 giây). 40000 nếu sàn chậm; 15000 nếu muốn kết thúc sớm.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTO_FUTURES_LEVERAGE: {
        type: 'number',
        default: 3,
        group: 'short_fill',
        label: 'Đòn bẩy futures mặc định',
        help: 'Đòn bẩy gửi sàn cho futures. Tăng = lời/lỗ phóng đại (rủi ro cao). Giảm = an toàn hơn, biên lãi lỗ nhỏ hơn.',
        example: 'Mặc định: 3. Tăng 5-10 chỉ khi chấp nhận rủi ro cao; giảm 1-2 để thận trọng.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    TESTNET_SYMBOL_CACHE_MS: {
        type: 'number',
        default: 21600000,
        group: 'short_fill',
        label: 'Thời gian làm mới danh sách mã testnet (ms)',
        help: 'Giữ bộ nhớ tạm danh sách cặp testnet. Tăng = ít gọi sàn. Giảm = cập nhật cặp mới nhanh hơn.',
        example: 'Mặc định: 21600000 (= 6 giờ). 3600000 = 1 giờ nếu hay đổi listing testnet.',
        note: 'Testnet: môi trường giả của sàn, không dùng tiền thật.',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_MIN_QUALITY_EMA_PULLBACK: {
        type: 'number',
        default: 0,
        group: 'advanced',
        label: 'Chất lượng · kéo về EMA',
        help: 'Ghi đè sàn chất lượng cho setup này. 0 = dùng chất lượng lệnh thực chung. Số lớn hơn 0: tăng = siết setup; giảm = nới setup.',
        example: 'Mặc định: 0 (theo chung). Đặt 80 để siết nhẹ; 86 để rất khắt khe.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_MIN_QUALITY_TREND_PULLBACK: {
        type: 'number',
        default: 0,
        group: 'advanced',
        label: 'Chất lượng · kéo về xu hướng',
        help: '0 = theo chung. Tăng = khó vào hơn. Giảm (nhưng lớn hơn 0) = dễ vào hơn.',
        example: 'Mặc định: 0. Đặt 84 nếu muốn siết riêng setup này.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_MIN_QUALITY_VWAP_RECLAIM: {
        type: 'number',
        default: 0,
        group: 'advanced',
        label: 'Chất lượng · lấy lại VWAP',
        help: '0 = theo chung. Tăng = siết. Giảm (nhưng lớn hơn 0) = nới setup này.',
        example: 'Mặc định: 0 (theo chung). Có thể đặt 82.',
        note: 'VWAP: giá trung bình theo khối lượng trong phiên; lấy lại VWAP là giá quay về vùng này.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_MIN_QUALITY_BREAKOUT_RETEST: {
        type: 'number',
        default: 0,
        group: 'advanced',
        label: 'Chất lượng · phá mức rồi kiểm tra lại',
        help: '0 = lấy mức cao hơn giữa chất lượng chung và 86 — setup này mặc định đã khắt khe. Tăng thêm = càng khó vào (an toàn).',
        example: 'Mặc định: 0 (khoảng từ 86 trở lên). Đặt 90 nếu muốn cực kỳ chọn lọc.',
        note: 'Retest: giá phá mức rồi quay lại kiểm tra mức đó trước khi tiếp tục.',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_MIN_QUALITY_SHORT_CONTINUATION: {
        type: 'number',
        default: 0,
        group: 'advanced',
        label: 'Chất lượng · short continuation',
        help: '0 = theo chung. Tăng = khó vào hơn. Giảm = dễ short hơn (rủi ro short tăng).',
        example: 'Mặc định: 0. Đặt 86 trở lên nếu short đang lỗ.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_LIVE_MIN_QUALITY_SHORT: {
        type: 'number',
        default: 0,
        group: 'advanced',
        label: 'Chất lượng · short',
        help: '0 = chung cộng 2 (siết hơn mua một chút). Tăng = short càng khó. Giảm (số lớn hơn 0) = nới short.',
        example: 'Mặc định: 0. Đặt 88 nếu muốn short rất chọn lọc.',
        note: '',
        badge: 'live',
        hintKind: 'default',
    },
    AUTODUCK_AUDIT_ENABLED: {
        type: 'boolean',
        default: true,
        group: 'audit',
        label: 'Enable audit log',
        help: 'Ghi sự kiện pipeline, funnel, broker ra file. Bật = dễ truy vết. Tắt = không ghi file audit.',
        example: 'Mặc định: bật. Tắt nếu không cần log file.',
        note: '',
        hintKind: 'default',
    },
    AUTODUCK_AUDIT_ENCRYPT: {
        type: 'boolean',
        default: false,
        group: 'audit',
        label: 'Encrypt audit log',
        help: 'Mã hóa dòng audit bằng khóa hệ thống. Bật = bảo mật hơn, đọc log khó hơn. Tắt = file chữ thường dễ đọc.',
        example: 'Mặc định: tắt. Bật trên máy có dữ liệu nhạy cảm.',
        note: '',
        hintKind: 'default',
    },
};

export const CONFIG_GROUP_META = {
    safety: {
        label: 'AN TOÀN LỆNH THỰC',
        order: 1,
        fieldOrder: [
            'MAX_LIVE_ORDER_VALUE_USDT',
            'MAX_LIVE_ORDERS_PER_USER',
        ],
    },
    idle: {
        label: 'THIẾU LỆNH / QUÉT / THĂM DÒ',
        order: 2,
        fieldOrder: [
            'AUTODUCK_IDLE_MIN_LIVE_SCORE',
            'AUTODUCK_IDLE_AI_PROBE_LIVE',
            'AUTODUCK_IDLE_FAST_SCAN_MS',
            'AUTODUCK_IDLE_RELAX_TARGETS',
            'AUTODUCK_IDLE_RELAX_STEP_SCORE',
            'AUTODUCK_IDLE_RELAX_MAX_SCORE',
            'AUTODUCK_IDLE_RELAX_MAX_ATTEMPTS',
            'AUTODUCK_IDLE_AI_PROBE_ENABLED',
            'AUTODUCK_IDLE_AI_PROBE_MIN_SCORE',
            'AUTODUCK_IDLE_AI_PROBE_SIZE_MULT',
            'AUTODUCK_IDLE_MIN_SIM_SCORE',
        ],
    },
    quality: {
        label: 'CHẤT LƯỢNG / LỆCH ĐIỂM / NÉ RỦI RO',
        order: 3,
        fieldOrder: [
            'AUTODUCK_LIVE_QUALITY_MIN',
            'AUTODUCK_LIVE_CONFLUENCE_MIN',
            'AUTODUCK_LIVE_EDGE_MIN',
            'AUTODUCK_LIVE_RISK_OFF_SIZE_MULT',
            'AUTODUCK_LIVE_RISK_OFF_VETO',
            'AUTODUCK_LIVE_SYMBOL_SOFT_BLOCK',
            'AUTODUCK_CRYPTO_VN_CROSS_BIAS',
            'AUTODUCK_CRYPTO_VN_BREADTH_BLEND',
            'AUTODUCK_CONTEXT_BIAS_MAX',
            'AUTODUCK_SIM_QUALITY_MIN',
            'AUTODUCK_SIM_CONFLUENCE_MIN',
            'AUTODUCK_SIM_EDGE_MIN',
        ],
    },
    short_fill: {
        label: 'SHORT / KHỚP LỆNH / TESTNET',
        order: 4,
        fieldOrder: [
            'AUTODUCK_AUTO_FUTURES_SHORT_ENABLED',
            'AUTO_FUTURES_LEVERAGE',
            'AUTODUCK_LIVE_ALLOW_SHORT_CONTINUATION',
            'AUTODUCK_LIVE_ALLOW_SHORT_FALLBACK',
            'AUTODUCK_LIVE_FILL_POLL_MS',
            'AUTODUCK_LIVE_FILL_TIMEOUT_MS',
            'TESTNET_SYMBOL_CACHE_MS',
        ],
    },
    advanced: {
        label: 'CHẤT LƯỢNG THEO SETUP (NÂNG CAO)',
        order: 5,
        fieldOrder: [
            'AUTODUCK_LIVE_MIN_QUALITY_EMA_PULLBACK',
            'AUTODUCK_LIVE_MIN_QUALITY_TREND_PULLBACK',
            'AUTODUCK_LIVE_MIN_QUALITY_VWAP_RECLAIM',
            'AUTODUCK_LIVE_MIN_QUALITY_BREAKOUT_RETEST',
            'AUTODUCK_LIVE_MIN_QUALITY_SHORT_CONTINUATION',
            'AUTODUCK_LIVE_MIN_QUALITY_SHORT',
        ],
    },
    audit: {
        label: 'AUDIT LOG',
        order: 6,
        fieldOrder: [
            'AUTODUCK_AUDIT_ENABLED',
            'AUTODUCK_AUDIT_ENCRYPT',
        ],
    },
};

const settingKeyFor = (envName) => `${SETTING_PREFIX}${envName}`;

const parseByType = (type, raw, fallback) => {
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (type === 'boolean') {
        if (typeof raw === 'boolean') return raw;
        if (raw === 1 || raw === '1') return true;
        if (raw === 0 || raw === '0') return false;
        const s = String(raw).toLowerCase();
        if (s === 'true') return true;
        if (s === 'false') return false;
        return fallback;
    }
    if (type === 'number') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }
    return String(raw);
};

/** Special: IDLE_AI_PROBE_ENABLED defaults true unless explicitly false in env/DB */
const resolveBooleanWithDefaultTrue = (dbVal, envVal, codeDefault) => {
    if (dbVal !== undefined && dbVal !== null && dbVal !== '') {
        return parseByType('boolean', dbVal, codeDefault);
    }
    if (envVal !== undefined && envVal !== null && envVal !== '') {
        return String(envVal).toLowerCase() !== 'false';
    }
    return codeDefault !== false;
};

let cache = {
    loaded: false,
    values: {},
    sources: {},
};

const buildFromMaps = (dbMap) => {
    const values = {};
    const sources = {};
    for (const [key, spec] of Object.entries(AUTODUCK_CONFIG_SCHEMA)) {
        const dbRaw = dbMap[settingKeyFor(key)];
        const envRaw = process.env[key];
        const hasDb = dbRaw !== undefined && dbRaw !== null && dbRaw !== '';
        const hasEnv = envRaw !== undefined && envRaw !== null && envRaw !== '';

        if (key === 'AUTODUCK_IDLE_AI_PROBE_ENABLED') {
            values[key] = resolveBooleanWithDefaultTrue(dbRaw, envRaw, spec.default);
            sources[key] = hasDb ? 'db' : hasEnv ? 'env' : 'default';
            continue;
        }

        if (hasDb) {
            values[key] = parseByType(spec.type, dbRaw, spec.default);
            sources[key] = 'db';
        } else if (hasEnv) {
            values[key] = parseByType(spec.type, envRaw, spec.default);
            sources[key] = 'env';
        } else {
            values[key] = spec.default;
            sources[key] = 'default';
        }
    }
    return { values, sources };
};

export const refreshAutoDuckConfigCache = async () => {
    const keys = Object.keys(AUTODUCK_CONFIG_SCHEMA).map(settingKeyFor);
    const rows = await Setting.find({ key: { $in: keys } }).lean();
    const dbMap = {};
    for (const row of rows) dbMap[row.key] = row.value;
    const built = buildFromMaps(dbMap);
    cache = { loaded: true, values: built.values, sources: built.sources };
    return cache;
};

const ensureCacheSync = () => {
    if (cache.loaded) return cache;
    const built = buildFromMaps({});
    cache = { loaded: true, values: built.values, sources: built.sources };
    return cache;
};

export const getAutoDuckConfigSync = () => ensureCacheSync().values;

export const getCfg = (key) => {
    const values = getAutoDuckConfigSync();
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
    const spec = AUTODUCK_CONFIG_SCHEMA[key];
    return spec ? spec.default : undefined;
};

export const getAutoDuckNumber = (key) => Number(getCfg(key));
export const getAutoDuckBoolean = (key) => Boolean(getCfg(key));
export const getAutoDuckString = (key) => String(getCfg(key) ?? '');

export const getIdleRelaxTargets = () => {
    const raw = getAutoDuckString('AUTODUCK_IDLE_RELAX_TARGETS') || '1,3,5';
    return raw
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v) && v > 0);
};

export const getConfigMeta = () => {
    const groups = Object.entries(CONFIG_GROUP_META)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([id, meta]) => {
            const byKey = Object.fromEntries(
                Object.entries(AUTODUCK_CONFIG_SCHEMA).filter(([, s]) => s.group === id)
            );
            const orderedKeys = (meta.fieldOrder || []).filter((k) => byKey[k]);
            const leftover = Object.keys(byKey).filter((k) => !orderedKeys.includes(k));
            const keys = [...orderedKeys, ...leftover].map((key) => {
                const s = byKey[key];
                return {
                    key,
                    type: s.type,
                    default: s.default,
                    label: s.label,
                    help: s.help,
                    example: s.example,
                    note: s.note || '',
                    badge: s.badge || null,
                    dependsOn: s.dependsOn || null,
                    hintKind: s.hintKind || 'example',
                };
            });
            return { id, label: meta.label, keys };
        });
    return { groups };
};

export const getEffectiveAutoDuckConfig = async () => {
    await refreshAutoDuckConfigCache();
    return {
        values: { ...cache.values },
        sources: { ...cache.sources },
        meta: getConfigMeta(),
    };
};

export const updateAutoDuckConfig = async (partial = {}) => {
    const updates = [];
    const applied = {};
    const changes = [];
    const beforeCache = { ...getAutoDuckConfigSync() };

    for (const [key, raw] of Object.entries(partial)) {
        const spec = AUTODUCK_CONFIG_SCHEMA[key];
        if (!spec) continue;
        const value = parseByType(spec.type, raw, spec.default);
        const from = beforeCache[key];
        applied[key] = value;
        changes.push({ key, from, to: value, changed: from !== value });
        updates.push(
            Setting.findOneAndUpdate(
                { key: settingKeyFor(key) },
                { value },
                { upsert: true, returnDocument: 'after' }
            )
        );

        if (key === 'AUTODUCK_AUTO_FUTURES_SHORT_ENABLED') {
            updates.push(
                Setting.findOneAndUpdate(
                    { key: 'autoFuturesShortEnabled' },
                    { value: Boolean(value) },
                    { upsert: true, returnDocument: 'after' }
                )
            );
        }
    }

    if (updates.length === 0) {
        return { applied: {}, changes: [], message: 'Không có key hợp lệ để cập nhật.' };
    }

    await Promise.all(updates);
    await refreshAutoDuckConfigCache();
    return {
        applied,
        changes,
        message: 'Cấu hình AutoTrade đã được lưu (áp dụng từ chu kỳ pipeline tiếp theo).',
    };
};
