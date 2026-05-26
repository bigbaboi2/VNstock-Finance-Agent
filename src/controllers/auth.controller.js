import User from '../../models/User.js';  

export const register = async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();
        const escaped = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username này đã có người sử dụng! Vui lòng chọn tên khác.' });
        }

        const newUser = new User({ username: cleanUsername, password });
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

        const user = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (!user || user.password !== password) {
            return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại hoặc mật khẩu truy cập sai!' });
        }

        return res.json({ success: true, username: user.username });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi server khi đăng nhập.' });
    }
};