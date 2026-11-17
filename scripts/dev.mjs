import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 3000;
const url = `http://${host}:${port}`;

const server = await createServer({
  server: { host, port, strictPort: true },
});
await server.listen();
server.printUrls();

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, MF_DEV_SERVER_URL: url, NODE_ENV: 'development' },
});

let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  try {
    await server.close();
  } finally {
    process.exit(code);
  }
}

child.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => {
  child.kill();
  shutdown(0);
});
process.on('SIGTERM', () => {
  child.kill();
  shutdown(0);
});
