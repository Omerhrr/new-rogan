type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: string;
  stack?: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const isProd = process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatDev(entry: LogEntry): string {
  const colors: Record<LogLevel, string> = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
  const reset = '\x1b[0m'; const dim = '\x1b[2m'; const bright = '\x1b[1m';
  const prefix = `${dim}${entry.timestamp}${reset} ${colors[entry.level]}${bright}${entry.level.toUpperCase().padEnd(5)}${reset}`;
  let line = `${prefix} ${entry.message}`;
  if (entry.context && Object.keys(entry.context).length > 0) line += ` ${dim}${JSON.stringify(entry.context)}${reset}`;
  if (entry.error) line += `\n  ${colors.error}Error: ${entry.error}${reset}`;
  if (entry.stack) line += `\n  ${dim}${entry.stack}${reset}`;
  return line;
}

function formatProd(entry: LogEntry): string {
  return JSON.stringify({ ...entry, stack: entry.level === 'error' ? entry.stack : undefined });
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = { timestamp: new Date().toISOString(), level, message };
  if (context && Object.keys(context).length > 0) entry.context = context;
  if (err instanceof Error) { entry.error = err.message; entry.stack = err.stack; }
  else if (typeof err === 'string') entry.error = err;
  const formatted = isProd ? formatProd(entry) : formatDev(entry);
  switch (level) {
    case 'error': console.error(formatted); break;
    case 'warn': console.warn(formatted); break;
    default: console.log(formatted);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, err?: unknown, context?: Record<string, unknown>) => log('error', message, context, err),
  child: (defaultContext: Record<string, unknown>) => ({
    debug: (message: string, context?: Record<string, unknown>) => log('debug', message, { ...defaultContext, ...context }),
    info: (message: string, context?: Record<string, unknown>) => log('info', message, { ...defaultContext, ...context }),
    warn: (message: string, context?: Record<string, unknown>) => log('warn', message, { ...defaultContext, ...context }),
    error: (message: string, err?: unknown, context?: Record<string, unknown>) => log('error', message, { ...defaultContext, ...context }, err),
  }),
};
