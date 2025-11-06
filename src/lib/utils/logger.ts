// Simple env-configurable logger with scopes and levels
// Levels: error < warn < info < debug

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silent';

function getEnvLevel(): LogLevel {
  // PUBLIC_LOG_LEVEL can be: 'silent', 'error', 'warn', 'info', 'debug'
  const level = (import.meta as any)?.env?.PUBLIC_LOG_LEVEL as string | undefined;
  if (!level) return (import.meta as any)?.env?.DEV ? 'debug' : 'warn';
  const normalized = level.toLowerCase();
  if (['silent', 'error', 'warn', 'info', 'debug'].includes(normalized)) return normalized as LogLevel;
  return 'warn';
}

const levelPriority: Record<Exclude<LogLevel, 'silent'>, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function shouldLog(method: Exclude<LogLevel, 'silent'>, current: LogLevel): boolean {
  if (current === 'silent') return false;
  return levelPriority[method] <= levelPriority[(current as Exclude<LogLevel, 'silent'>)] ;
}

function formatPrefix(scope?: string) {
  return scope ? `[${scope}]` : '';
}

export const logger = {
  scope(scope: string) {
    const currentLevel = getEnvLevel();
    return {
      error: (...args: unknown[]) => {
        if (shouldLog('error', currentLevel)) console.error(formatPrefix(scope), ...args);
      },
      warn: (...args: unknown[]) => {
        if (shouldLog('warn', currentLevel)) console.warn(formatPrefix(scope), ...args);
      },
      info: (...args: unknown[]) => {
        if (shouldLog('info', currentLevel)) console.info(formatPrefix(scope), ...args);
      },
      debug: (...args: unknown[]) => {
        if (shouldLog('debug', currentLevel)) console.debug(formatPrefix(scope), ...args);
      }
    };
  }
};

export type Logger = ReturnType<typeof logger.scope>;



