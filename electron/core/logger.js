import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function createLogger({ directory, level = 'info' }) {
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, 'modern-fashion.log');
  const order = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = order[level] ?? order.info;

  function rotateIfNeeded() {
    try {
      if (fs.existsSync(filename) && fs.statSync(filename).size > MAX_LOG_BYTES) {
        const previous = path.join(directory, 'modern-fashion.previous.log');
        if (fs.existsSync(previous)) fs.unlinkSync(previous);
        fs.renameSync(filename, previous);
      }
    } catch {
      // Logging must never break a sale.
    }
  }

  function write(levelName, message, details) {
    if ((order[levelName] ?? 0) < threshold) return;
    const entry = {
      at: new Date().toISOString(),
      level: levelName,
      message: String(message),
      ...(details && typeof details === 'object' ? { details } : {}),
    };
    const line = `${JSON.stringify(entry)}\n`;
    try {
      rotateIfNeeded();
      fs.appendFileSync(filename, line, 'utf8');
    } catch {
      // Ignore a failed log write; the operation itself must continue.
    }
    if (process.env.NODE_ENV !== 'production') {
      const output = levelName === 'error' ? console.error : levelName === 'warn' ? console.warn : console.log;
      output(`[${levelName}] ${message}`, details || '');
    }
  }

  return {
    debug: (message, details) => write('debug', message, details),
    info: (message, details) => write('info', message, details),
    warn: (message, details) => write('warn', message, details),
    error: (message, details) => write('error', message, details),
    filename,
  };
}
