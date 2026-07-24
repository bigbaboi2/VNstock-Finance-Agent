import User from '../../models/User.js';

const UI_STYLES = new Set(['classic', 'minimal', 'book']);

const DEFAULT_PREFERENCES = Object.freeze({
    theme: 'dark',
    clock3d: true,
    uiStyle: 'classic',
});

const normalizePreferences = (prefs) => {
    const theme = prefs?.theme === 'light' ? 'light' : 'dark';
    const clock3d = prefs?.clock3d !== false;
    const uiStyle = UI_STYLES.has(prefs?.uiStyle) ? prefs.uiStyle : 'classic';
    return { theme, clock3d, uiStyle };
};

const findUserByUsername = async (username) => {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return null;
    const escaped = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return User.findOne({ username: { $regex: new RegExp(`^${escaped}$`, 'i') } });
};

export const register = async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();
        const existingUser = await findUserByUsername(cleanUsername);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username này đã có người sử dụng! Vui lòng chọn tên khác.' });
        }

        const newUser = new User({
            username: cleanUsername,
            password,
            preferences: { ...DEFAULT_PREFERENCES },
        });
        await newUser.save();
        return res.json({ success: true, message: 'Tạo tài khoản thành công!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi server khi đăng ký hệ thống.' });
    }
};

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();

        const user = await findUserByUsername(cleanUsername);
        if (!user || user.password !== password) {
            return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại hoặc mật khẩu truy cập sai!' });
        }

        return res.json({
            success: true,
            username: user.username,
            preferences: normalizePreferences(user.preferences),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi server khi đăng nhập.' });
    }
};

/** GET /api/auth/preferences?username=... — lấy preference UI theo tài khoản. */
export const getPreferences = async (req, res) => {
    try {
        const username = req.query?.username || req.body?.username;
        const user = await findUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
        }
        return res.json({
            success: true,
            username: user.username,
            preferences: normalizePreferences(user.preferences),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Lỗi khi đọc preference.' });
    }
};

/** POST /api/auth/preferences — cập nhật theme / clock3d / uiStyle theo username. */
export const updatePreferences = async (req, res) => {
    try {
        const { username, theme, clock3d, uiStyle } = req.body || {};
        const user = await findUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
        }

        const next = normalizePreferences(user.preferences);
        if (theme === 'dark' || theme === 'light') next.theme = theme;
        if (typeof clock3d === 'boolean') next.clock3d = clock3d;
        if (UI_STYLES.has(uiStyle)) next.uiStyle = uiStyle;

        user.preferences = next;
        user.markModified('preferences');
        await user.save();

        return res.json({
            success: true,
            message: 'Đã lưu preference.',
            preferences: next,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Lỗi khi lưu preference.' });
    }
};
