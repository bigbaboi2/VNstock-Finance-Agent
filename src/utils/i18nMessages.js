/**
 * Resolve request language from header / body / query.
 * Frontend sends X-Omni-Language: vi|en
 */
export function resolveLanguage(req) {
    const raw =
        req?.headers?.['x-omni-language'] ||
        req?.body?.language ||
        req?.query?.language ||
        'vi';
    return String(raw).trim().toLowerCase().startsWith('en') ? 'en' : 'vi';
}

const MESSAGES = {
    auth: {
        usernameTaken: {
            vi: 'Username này đã có người sử dụng! Vui lòng chọn tên khác.',
            en: 'This username is already taken! Please choose another.',
        },
        registerSuccess: {
            vi: 'Tạo tài khoản thành công!',
            en: 'Account created successfully!',
        },
        registerServerError: {
            vi: 'Lỗi server khi đăng ký hệ thống.',
            en: 'Server error while registering.',
        },
        loginInvalid: {
            vi: 'Tài khoản không tồn tại hoặc mật khẩu truy cập sai!',
            en: 'Account does not exist or password is incorrect!',
        },
        loginServerError: {
            vi: 'Lỗi server khi đăng nhập.',
            en: 'Server error while signing in.',
        },
        userNotFound: {
            vi: 'Không tìm thấy tài khoản.',
            en: 'Account not found.',
        },
        prefsReadError: {
            vi: 'Lỗi khi đọc preference.',
            en: 'Failed to read preferences.',
        },
        prefsSaved: {
            vi: 'Đã lưu preference.',
            en: 'Preferences saved.',
        },
        prefsSaveError: {
            vi: 'Lỗi khi lưu preference.',
            en: 'Failed to save preferences.',
        },
    },
};

/**
 * Translate a catalog message key.
 * @param {string} lang - 'vi' | 'en'
 * @param {string} ns - namespace e.g. 'auth'
 * @param {string} key - message key
 * @param {string} [fallback]
 */
export function tMsg(lang, ns, key, fallback = '') {
    const entry = MESSAGES[ns]?.[key];
    if (!entry) return fallback || key;
    return entry[lang === 'en' ? 'en' : 'vi'] || entry.vi || fallback || key;
}

export function aiLanguageInstruction(lang) {
    return lang === 'en'
        ? 'Respond entirely in English.'
        : 'Trả lời toàn bộ bằng tiếng Việt.';
}

export { MESSAGES };
