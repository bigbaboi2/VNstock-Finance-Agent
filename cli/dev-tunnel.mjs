import 'dotenv/config';
import { spawn } from 'child_process';

const domain = process.env.NGROK_DOMAIN?.trim();
if (!domain) {
  console.error('Missing NGROK_DOMAIN in .env');
  process.exit(1);
}

const child = spawn(
  'npx',
  ['ngrok', 'http', '3001', `--url=${domain}`],
  { stdio: 'inherit', shell: true }
);
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
