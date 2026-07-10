import React from 'react';
import { X, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';

const GUIDES = {
    BINANCE: {
        title: 'Hướng dẫn kết nối Binance',
        link: 'https://www.binance.com/en/my/settings/api-management',
        steps: [
            'Đăng nhập vào tài khoản Binance, truy cập mục <strong>API Management (Quản lý API)</strong>.',
            'Bấm <strong>Create API</strong>, chọn loại <em>System generated</em>.',
            'Đặt tên cho API (vd: OmniDuck). Vượt qua các bước xác thực bảo mật.',
            'Bấm <strong>Edit restrictions</strong>. Tích chọn <strong>Enable Reading</strong> và <strong>Enable Spot & Margin Trading</strong>.',
            '<span class="text-red-400 font-bold">TUYỆT ĐỐI KHÔNG tích chọn Enable Withdrawals (Rút tiền).</span>',
            'Copy <strong>API Key</strong> và <strong>Secret Key</strong> dán vào hệ thống. (Secret Key chỉ hiển thị 1 lần duy nhất).'
        ],
        note: 'Lưu ý: Nếu bạn không gán IP tĩnh cho API Key, Binance sẽ tự động vô hiệu hóa quyền Trade sau 90 ngày.'
    },
    DNSE: {
        title: 'Hướng dẫn kết nối DNSE LightSpeed',
        link: 'https://entradex.dnse.com.vn/',
        steps: [
            'Truy cập ứng dụng hoặc trang web Entrade X của DNSE.',
            'Vào phần Cài đặt / Quản lý tài khoản, tìm mục <strong>API Management (Kết nối API)</strong>.',
            'Tạo kết nối API mới dành cho Cá nhân (Personal API).',
            'Cấp quyền truy cập <strong>Tra cứu thông tin</strong> và <strong>Giao dịch</strong>.',
            'Hệ thống DNSE sẽ cung cấp <strong>API Key</strong> và <strong>Secret Key</strong>.',
            'Đối với chuẩn LightSpeed mới, bạn không cần nhập Mã PIN (Passphrase) ở bước kết nối, mã PIN chỉ yêu cầu khi hệ thống đẩy lệnh.'
        ],
        note: 'API của DNSE hỗ trợ giao dịch Cổ phiếu và Phái sinh tốc độ cao.'
    },
    OKX: {
        title: 'Hướng dẫn kết nối OKX V5',
        link: 'https://www.okx.com/account/my-api',
        steps: [
            'Đăng nhập OKX, vào mục <strong>Profile > API</strong>.',
            'Bấm <strong>Apply for v5 API</strong> (Tạo API v5).',
            'Đặt tên API, tạo <strong>Passphrase</strong> (Mật khẩu API - cực kỳ quan trọng, hãy ghi nhớ).',
            'Mục Permissions (Quyền), tích chọn <strong>Read</strong> và <strong>Trade</strong>.',
            'Xác thực Email/2FA. Màn hình sẽ hiện API Key và Secret Key.',
            'Điền API Key, Secret Key và Passphrase vừa tạo vào hệ thống.'
        ]
    },
    BYBIT: {
        title: 'Hướng dẫn kết nối Bybit',
        link: 'https://www.bybit.com/app/user/api-management',
        steps: [
            'Vào <strong>API Management</strong> trên Bybit.',
            'Chọn <strong>Create New Key</strong> > System-generated API Keys.',
            'Chọn <strong>API Transaction</strong>. Đặt tên API.',
            'Bật quyền <strong>Read-Write</strong>. Tích chọn các mục Spot, Derivatives, Options...',
            'KHÔNG cấp quyền Account Transfer/Withdrawal.',
            'Copy API Key và Secret Key dán vào hệ thống.'
        ]
    }
};

export default function ExchangeGuideModal({ exchangeName, isDark, UI, onClose }) {
    const guide = GUIDES[exchangeName];

    if (!guide) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] ${isDark ? 'bg-[#0B0F14] border-white/10' : 'bg-white border-slate-200'}`}>
                {/* HEADER */}
                <div className={`p-4 border-b flex justify-between items-center ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                            <ShieldCheck size={18} />
                        </div>
                        <h3 className={`font-black text-sm uppercase tracking-wider ${UI.textBold}`}>
                            {guide.title}
                        </h3>
                    </div>
                    <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                        <X size={18} />
                    </button>
                </div>

                {/* BODY */}
                <div className="p-5 overflow-y-auto">
                    <ol className="space-y-4">
                        {guide.steps.map((step, idx) => (
                            <li key={idx} className="flex gap-3 text-sm leading-relaxed">
                                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-black text-xs mt-0.5 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-200 text-black'}`}>
                                    {idx + 1}
                                </div>
                                <div className={UI.textNormal} dangerouslySetInnerHTML={{ __html: step }} />
                            </li>
                        ))}
                    </ol>

                    {guide.note && (
                        <div className={`mt-6 p-3 rounded-xl flex gap-2 text-xs border ${isDark ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                            <p dangerouslySetInnerHTML={{ __html: guide.note }} />
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className={`p-4 border-t flex justify-end gap-3 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                    <a
                        href={guide.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2 transition-colors"
                    >
                        Tới trang quản lý API <ExternalLink size={14} />
                    </a>
                </div>
            </div>
        </div>
    );
}
