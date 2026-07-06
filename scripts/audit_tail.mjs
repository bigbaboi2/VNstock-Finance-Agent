import 'dotenv/config';
import { readAuditFileTail, getAuditStatus } from '../src/services/auditLogService.js';

const argv = process.argv.slice(2);
const getArg = (name, fallback = null) => {
    const i = argv.indexOf(name);
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
    const eq = argv.find((a) => a.startsWith(`${name}=`));
    return eq ? eq.split('=')[1] : fallback;
};

const channel = getArg('--channel', 'funnel');
const date = getArg('--date', null);
const limit = Number(getArg('--limit', '50')) || 50;

const run = async () => {
    const status = getAuditStatus();
    console.log('Audit status:', status);
    const rows = await readAuditFileTail({ channel, date, limit });
    console.log(`\n== ${channel} (${rows.length} dòng) ==`);
    rows.forEach((row, idx) => {
        console.log(`#${idx + 1}`, JSON.stringify(row));
    });
};

run().catch((err) => {
    console.error('ERR:', err.message);
    process.exit(1);
});
