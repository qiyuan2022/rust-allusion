import { info, error, warn, debug, trace } from '@tauri-apps/plugin-log';

let initialized = false;

export function initLogger() {
  if (initialized) return;
  initialized = true;

  // 只在 Tauri 环境中启用日志重定向
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
  if (!isTauri) return;

  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.debug,
    trace: console.trace,
  };

  const formatArgs = (args: any[]) =>
    args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');

  console.log = (...args: any[]) => {
    info(formatArgs(args));
    original.log(...args);
  };

  console.error = (...args: any[]) => {
    error(formatArgs(args));
    original.error(...args);
  };

  console.warn = (...args: any[]) => {
    warn(formatArgs(args));
    original.warn(...args);
  };

  console.debug = (...args: any[]) => {
    debug(formatArgs(args));
    original.debug(...args);
  };

  console.trace = (...args: any[]) => {
    trace(formatArgs(args));
    original.trace(...args);
  };
}
