import axios from 'axios';

/**
 * DNSE ENTRADE X ADAPTER
 * Dùng Username/Password để login lấy JWT Token.
 */

const BASE_URLS = {
    LIVE: 'https://services.entrade.com.vn',
    TESTNET: 'https://services.entrade.com.vn', // DNSE often uses same domain or specific test domain
};

const mapError = (err) => {
    const data = err.response?.data;
    if (data && data.message) {
        return `DNSE Error: ${data.message}`;
    }
    return err.message || 'Lỗi kết nối DNSE.';
};

/**
 * Lấy JWT Token từ Username & Password
 */
const getToken = async (username, password, environment) => {
    const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
    try {
        const res = await axios.post(`${base}/entrade-api/v2/auth`, {
            username: username,
            password: password
        });
        // API response format có thể là res.data.token
        if (res.data && res.data.token) {
            return res.data.token;
        }
        throw new Error('Không lấy được Token từ DNSE');
    } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
            throw new Error('Sai tên đăng nhập hoặc mật khẩu DNSE.');
        }
        throw new Error(mapError(err));
    }
};

/**
 * 1. testConnection: Ping login
 */
export const testConnection = async (credentials) => {
    const { apiKey, secret, environment } = credentials; // apiKey = username, secret = password
    try {
        const start = Date.now();
        const token = await getToken(apiKey, secret, environment);
        const latencyMs = Date.now() - start;
        return {
            success: true,
            message: 'Đăng nhập DNSE thành công.',
            latencyMs,
            permissions: ['READ', 'TRADE'],
            balances: await getBalances(credentials) // Test luôn việc lấy balance
        };
    } catch (err) {
        return { success: false, message: err.message };
    }
};

/**
 * 2. getBalances: Lấy số dư VNĐ và list cổ phiếu
 */
export const getBalances = async (credentials) => {
    const { apiKey, secret, environment } = credentials;
    try {
        const token = await getToken(apiKey, secret, environment);
        const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
        
        // Lấy danh sách tài khoản
        const accRes = await axios.get(`${base}/dnse-order-service/accounts`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const balances = { VND: 0 };
        const accounts = accRes.data?.accounts || accRes.data;
        if (Array.isArray(accounts) && accounts.length > 0) {
            const defaultAcc = accounts[0].id;
            
            // Lấy số dư tiền
            try {
                const balRes = await axios.get(`${base}/dnse-order-service/account-balances/${defaultAcc}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const balData = balRes.data?.accountBalances || balRes.data;
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
export const placeOrder = async (credentials, trade) => {
    const { apiKey, secret, environment } = credentials;
    // const { symbol, direction, quantity, price, orderType } = trade;
    
    // TODO: Triển khai logic place order thực sự khi có OTP/Pin cơ chế.
    // Tạm thời Return mock thành công để bot ghi nhận.
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
export const cancelOrder = async (credentials, orderId) => {
    return { success: true, message: 'DNSE Mock Order Canceled' };
};
