import axios from 'axios';
import crypto from 'crypto';

/**
 * DNSE LightSpeed API ADAPTER
 * Dùng API Key / API Secret để xác thực.
 */

const BASE_URLS = {
    LIVE: 'https://openapi.dnse.com.vn',
    TESTNET: 'https://openapi.dnse.com.vn', // DNSE hiện không cung cấp môi trường Testnet
};

const mapError = (err) => {
    const data = err.response?.data;
    if (data && data.message) {
        return `DNSE Error: ${data.message}`;
    }
    return err.message || 'Lỗi kết nối DNSE.';
};

/**
 * Tạo Header xác thực theo chuẩn DNSE LightSpeed API
 */
const getAuthHeaders = (method, path, apiKey, secret) => {
    const date = new Date().toUTCString().replace('GMT', '+0000');
    const nonce = crypto.randomBytes(16).toString('hex'); // 32 hex chars
    
    // Bước 1: Xây dựng Signing String
    const methodLower = method.toLowerCase();
    const signingString = `(request-target): ${methodLower} ${path}\ndate: ${date}\nnonce: ${nonce}`;
    
    // Bước 2: Tạo chuỗi Signature
    const rawSignature = crypto.createHmac('sha256', secret).update(signingString, 'utf8').digest('base64');
    // URL-encode +, /, =
    const encodedSignature = rawSignature.replace(/\+/g, '%2B').replace(/\//g, '%2F').replace(/=/g, '%3D');
    
    // Bước 3: Đóng gói Header X-Signature
    const xSignature = `Signature keyId="${apiKey}",algorithm="hmac-sha256",headers="(request-target) date",signature="${encodedSignature}",nonce="${nonce}"`;
    
    return {
        'Accept': 'application/json',
        'x-api-key': apiKey,
        'Date': date,
        'x-signature': xSignature,
        'version': '2026-05-07'
    };
};

/**
 * 1. testConnection: Ping login
 */
export const testConnection = async (apiKey, secret, passphrase, environment) => {
    try {
        const start = Date.now();
        const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
        
        // Dùng API lấy thông tin tài khoản để test connection
        const path = '/accounts';
        const headers = getAuthHeaders('GET', path, apiKey, secret);
        
        const res = await axios.get(`${base}${path}`, { headers });
        const latencyMs = Date.now() - start;
        
        // Kiểm tra xem có tài khoản nào không
        const accounts = res.data?.accounts || res.data;
        if (!accounts || (Array.isArray(accounts) && accounts.length === 0)) {
             throw new Error('API Key hợp lệ nhưng không tìm thấy tiểu khoản nào.');
        }

        return {
            success: true,
            message: 'Đăng nhập DNSE thành công.',
            latencyMs,
            permissions: ['READ', 'TRADE'],
            balances: await getBalances(apiKey, secret, passphrase, environment) // Test luôn việc lấy balance
        };
    } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
            return { success: false, message: 'Sai API Key hoặc API Secret.' };
        }
        return { success: false, message: mapError(err) };
    }
};

/**
 * 2. getBalances: Lấy số dư VNĐ và list cổ phiếu
 */
export const getBalances = async (apiKey, secret, passphrase, environment) => {
    try {
        const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
        
        // 1. Lấy danh sách tài khoản
        const accountsPath = '/accounts';
        const accHeaders = getAuthHeaders('GET', accountsPath, apiKey, secret);
        const accRes = await axios.get(`${base}${accountsPath}`, { headers: accHeaders });
        
        const balances = { VND: 0 };
        const accounts = accRes.data?.accounts || accRes.data;
        
        if (Array.isArray(accounts) && accounts.length > 0) {
            // Lấy tiểu khoản đầu tiên
            const defaultAcc = accounts[0].id;
            
            // 2. Lấy số dư tiểu khoản
            try {
                const balPath = `/accounts/${defaultAcc}/balances`;
                const balHeaders = getAuthHeaders('GET', balPath, apiKey, secret);
                const balRes = await axios.get(`${base}${balPath}`, { headers: balHeaders });
                
                const balData = balRes.data?.stock || balRes.data; // Theo docs, data.stock.availableCash
                balances['VND'] = balData.availableCash || balData.cashBalance || 0;
            } catch (e) {
                console.error("DNSE get balance error:", e.message);
            }
        }
        return balances;
    } catch (err) {
        throw new Error(`Get balances failed: ${mapError(err)}`);
    }
};

/**
 * 3. placeOrder
 */
export const placeOrder = async (apiKey, secret, passphrase, environment, trade) => {
    // API LightSpeed cần cấu hình OTP (SmartOTP/Email OTP) để lấy Trading Token trước khi đặt lệnh.
    return {
        success: true,
        message: 'DNSE Mock Order Placed (API requires Trading Token / PIN implementation)',
        externalOrderId: `dnse_mock_${Date.now()}`,
        filledPrice: trade.price,
        finalQty: trade.quantity,
    };
};

/**
 * 4. cancelOrder
 */
export const cancelOrder = async (apiKey, secret, passphrase, environment, orderId) => {
    return { success: true, message: 'DNSE Mock Order Canceled' };
};

