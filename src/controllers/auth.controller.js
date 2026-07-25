import User from '../../models/User.js';
import { resolveLanguage, tMsg } from '../utils/i18nMessages.js';

const UI_STYLES = new Set(['classic', 'minimal', 'book', 'ultra']);
const FONT_SCALES = new Set(['sm', 'md', 'lg', 'xl']);
const LANGUAGES = new Set(['vi', 'en']);

const DEFAULT_PREFERENCES = Object.freeze({
    theme: 'dark',
    clock3d: true,
    uiStyle: 'classic',
    fontScale: 'md',
    language: 'vi',
});

const normalizePreferences = (prefs) => {
    const theme = prefs?.theme === 'light' ? 'light' : 'dark';
    const clock3d = prefs?.clock3d !== false;
    const uiStyle = UI_STYLES.has(prefs?.uiStyle) ? prefs.uiStyle : 'classic';
    const fontScale = FONT_SCALES.has(prefs?.fontScale) ? prefs.fontScale : 'md';
    const language = LANGUAGES.has(prefs?.language) ? prefs.language : 'vi';
    return { theme, clock3d, uiStyle, fontScale, language };
};

const findUserByUsername = async (username) => {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return null;
    const escaped = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return User.findOne({ username: { $regex: new RegExp(`^${escaped}$`, 'i') } });
};

export const register = async (req, res) => {
    const lang = resolveLanguage(req);
    try {
        const { username, password } = req.body || {};
        if (!username || !password || typeof username !== 'string') {
            return res.status(400).json({
                success: false,
                message: tMsg(lang, 'auth', 'usernameTaken'),
            });
        }
        const cleanUsername = username.trim();
        const existingUser = await findUserByUsername(cleanUsername);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: tMsg(lang, 'auth', 'usernameTaken'),
            });
        }

        const newUser = new User({
            username: cleanUsername,
            password,
            preferences: { ...DEFAULT_PREFERENCES },
        });
        await newUser.save();
        return res.json({
            success: true,
            message: tMsg(lang, 'auth', 'registerSuccess'),
        });
    } catch (error) {
        console.error('[AUTH REGISTER ERROR]:', error);
        return res.status(500).json({
            success: false,
            message: tMsg(lang, 'auth', 'registerServerError'),
        });
    }
};

export const login = async (req, res) => {
    const lang = resolveLanguage(req);
    try {
        const { username, password } = req.body || {};
        if (!username || !password || typeof username !== 'string') {
            return res.status(400).json({
                success: false,
                message: tMsg(lang, 'auth', 'loginInvalid'),
            });
        }
        const cleanUsername = username.trim();

        const user = await findUserByUsername(cleanUsername);
        if (!user || user.password !== password) {
            console.log(chalk.yellow(`[AUTH LOGIN FAIL] Username: '${cleanUsername}' | User found in DB: ${!!user} | Password match: ${user ? user.password === password : false}`));
            return res.status(400).json({
                success: false,
                message: tMsg(lang, 'auth', 'loginInvalid'),
            });
        }

        return res.json({
            success: true,
            username: user.username,
            preferences: normalizePreferences(user.preferences),
        });
    } catch (error) {
        console.error('[AUTH LOGIN ERROR]:', error);
        return res.status(500).json({
            success: false,
            message: tMsg(lang, 'auth', 'loginServerError'),
        });
    }
};

/** GET /api/auth/preferences?username=... — lấy preference UI theo tài khoản. */
export const getPreferences = async (req, res) => {
    const lang = resolveLanguage(req);
    try {
        const username = req.query?.username || req.body?.username;
        const user = await findUserByUsername(username);
        if (!user) {
            return res.json({
                success: false,
                message: tMsg(lang, 'auth', 'userNotFound'),
                preferences: null,
            });
        }
        return res.json({
            success: true,
            username: user.username,
            preferences: normalizePreferences(user.preferences),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || tMsg(lang, 'auth', 'prefsReadError'),
        });
    }
};

/** POST /api/auth/preferences — cập nhật theme / clock3d / uiStyle / fontScale / language theo username. */
export const updatePreferences = async (req, res) => {
    const lang = resolveLanguage(req);
    try {
        const { username, theme, clock3d, uiStyle, fontScale, language } = req.body || {};
        const user = await findUserByUsername(username);
        if (!user) {
            return res.json({
                success: false,
                message: tMsg(lang, 'auth', 'userNotFound'),
                preferences: normalizePreferences({ theme, clock3d, uiStyle, fontScale, language }),
            });
        }

        const next = normalizePreferences(user.preferences);
        if (theme === 'dark' || theme === 'light') next.theme = theme;
        if (typeof clock3d === 'boolean') next.clock3d = clock3d;
        if (UI_STYLES.has(uiStyle)) next.uiStyle = uiStyle;
        if (FONT_SCALES.has(fontScale)) next.fontScale = fontScale;
        if (LANGUAGES.has(language)) next.language = language;

        user.preferences = next;
        user.markModified('preferences');
        await user.save();

        return res.json({
            success: true,
            message: tMsg(next.language || lang, 'auth', 'prefsSaved'),
            preferences: next,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || tMsg(lang, 'auth', 'prefsSaveError'),
        });
    }
};
