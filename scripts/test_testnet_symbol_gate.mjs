/**
 * Kiểm tra gate symbol TESTNET (không cần MongoDB).
 * Chạy: node scripts/test_testnet_symbol_gate.mjs
 */
import chalk from 'chalk';
import {
    fetchTradableSymbolsSet,
    isSymbolTradableOnConnection,
    filterSymbolsForTestnetUniverse,
} from '../src/services/testnetSymbolGate.js';

const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
};

const spotSet = await fetchTradableSymbolsSet({
    exchangeName: 'BINANCE',
    environment: 'TESTNET',
    marketType: 'SPOT',
});
assert(spotSet && spotSet.size > 0, 'Binance TESTNET SPOT phải có symbol');
assert(spotSet.has('BTCUSDT'), 'BTCUSDT phải có trên Binance testnet spot');
console.log(chalk.green(`✓ Binance TESTNET SPOT: ${spotSet.size} cặp · BTCUSDT=${spotSet.has('BTCUSDT')}`));

const fakeConn = {
    exchangeName: 'BINANCE',
    environment: 'TESTNET',
    username: 'test',
};
const btcOk = await isSymbolTradableOnConnection(fakeConn, 'BTC', 'LONG');
assert(btcOk.supported, 'BTC LONG phải supported');
console.log(chalk.green(`✓ BTC LONG trên testnet: supported`));

const pepeOk = await isSymbolTradableOnConnection(fakeConn, 'PEPE', 'LONG');
console.log(chalk.gray(`  PEPE LONG trên testnet: ${pepeOk.supported ? 'supported' : 'unsupported'} — ${pepeOk.reason || 'OK'}`));

const filtered = filterSymbolsForTestnetUniverse(
    ['BTC', 'ETH', 'PEPE', 'WIF', 'SOL'],
    spotSet
);
assert(filtered.includes('BTC') && filtered.includes('ETH'), 'Universe lọc phải giữ BTC/ETH');
console.log(chalk.green(`✓ Universe filter: [BTC,ETH,PEPE,WIF,SOL] → [${filtered.join(', ')}]`));

console.log(chalk.green.bold('\nTất cả kiểm tra testnet symbol gate đều pass.'));
