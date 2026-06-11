import crypto from 'crypto';

/**
 * ENCRYPTION SERVICE — AES-256-GCM
 * Mã hóa API key/secret của user trước khi lưu MongoDB.
 * - Key lấy từ process.env.ENCRYPTION_KEY (64 ký tự hex = 32 bytes)
 * - IV random 12 bytes mỗi lần encrypt
 * - Lưu DB dạng JSON string: { iv, authTag, encrypted } (base64)
 *
 * QUY TẮC AN TOÀN:
 * - Không bao giờ log plaintext key
 * - Decrypt chỉ trong memory ngay trước khi gọi sàn
 * - Nếu ENCRYPTION_KEY chưa set → throw rõ ràng, KHÔNG fallback
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const getKey = () => {
    const hexKey = process.env.ENCRYPTION_KEY;
    if (!hexKey || hexKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(hexKey)) {
        throw new Error(
            '[ENCRYPTION] ENCRYPTION_KEY chưa được cấu hình hợp lệ trong .env (cần 64 ký tự hex). ' +
            'Sinh key bằng: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    return Buffer.from(hexKey, 'hex');
};

export const encrypt = (plaintext) => {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new Error('[ENCRYPTION] Dữ liệu cần mã hóa không hợp lệ.');
    }
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return JSON.stringify({
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        encrypted: encrypted.toString('base64'),
    });
};

export const decrypt = (ciphertextJson) => {
    if (!ciphertextJson) {
        throw new Error('[ENCRYPTION] Không có dữ liệu để giải mã.');
    }
    const key = getKey();
    let parsed;
    try {
        parsed = JSON.parse(ciphertextJson);
    } catch {
        throw new Error('[ENCRYPTION] Định dạng ciphertext không hợp lệ.');
    }
    const { iv, authTag, encrypted } = parsed;
    if (!iv || !authTag || !encrypted) {
        throw new Error('[ENCRYPTION] Ciphertext thiếu thành phần (iv/authTag/encrypted).');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
};

/** Mask key để hiển thị an toàn: abcd****wxyz */
export const maskKey = (plainKey) => {
    if (!plainKey || plainKey.length < 8) return '****';
    return `${plainKey.slice(0, 4)}****${plainKey.slice(-4)}`;
};
