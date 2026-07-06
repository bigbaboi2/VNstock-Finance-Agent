import {
    resolveAssetMacro,
    CRYPTO_VN_BREADTH_BLEND,
    CRYPTO_VN_CROSS_BIAS,
} from '../src/services/tradeContextService.js';

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const vnBear = {
    source: 'VN_MARKET',
    breadthRatio: 30.8,
    statusType: 'bearish',
    marketStatus: 'ÁP LỰC BÁN THÁO',
    diagnosticDesc: 'test',
};

const cryptoMacro = {
    source: 'CRYPTO_MACRO',
    breadthRatio: 62,
    statusType: 'neutral',
    marketStatus: 'BTC ổn định',
    diagnosticDesc: 'crypto test',
    fearGreed: 48,
    btcChangePct: 0.5,
};

const cryptoResolved = resolveAssetMacro('CRYPTO', vnBear, cryptoMacro);
const vnResolved = resolveAssetMacro('VN_STOCK', vnBear, cryptoMacro);

assert(cryptoResolved.statusType === 'neutral', 'CRYPTO phải dùng statusType crypto, không VN bearish');
assert(cryptoResolved.primarySource === 'CRYPTO_MACRO', 'CRYPTO primarySource phải là crypto macro');
assert(
    Math.abs(cryptoResolved.breadthRatio - (cryptoMacro.breadthRatio * (1 - CRYPTO_VN_BREADTH_BLEND) + vnBear.breadthRatio * CRYPTO_VN_BREADTH_BLEND)) < 0.2,
    `CRYPTO breadth phải blend ~${CRYPTO_VN_BREADTH_BLEND}`
);
assert(vnResolved.breadthRatio === vnBear.breadthRatio, 'VN_STOCK giữ nguyên VN breadth');
assert(vnResolved.statusType === 'bearish', 'VN_STOCK giữ VN statusType');

console.log('✓ test_macro_resolution passed');
console.log(`  CRYPTO breadth=${cryptoResolved.breadthRatio} (blend ${CRYPTO_VN_BREADTH_BLEND})`);
console.log(`  CRYPTO_VN_CROSS_BIAS=${CRYPTO_VN_CROSS_BIAS}`);
