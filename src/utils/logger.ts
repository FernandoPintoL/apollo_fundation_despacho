/**
 * Logger Utility
 * Provides structured logging for the Apollo Gateway
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: string;
}

class Logger {
  constructor(level: LogLevel = 'info') {
    // Level can be used for filtering in future implementations
    void level;
  }

  private log(level: LogLevel, message: string, context?: any, error?: Error): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      ...(error && { error: error.message }),
    };

    const output = process.env.LOG_FORMAT === 'json'
      ? JSON.stringify(logEntry)
      : `[${logEntry.timestamp}] ${level.toUpperCase()}: ${message}`;

    switch (level) {
      case 'error':
        console.error(output, context || '');
        break;
      case 'warn':
        console.warn(output, context || '');
        break;
      case 'info':
        console.log(output, context || '');
        break;
      case 'debug':
        if (process.env.DEBUG === 'true') {
          console.log(output, context || '');
        }
        break;
    }
  }

  info(message: string, context?: any): void {
    this.log('info', message, context);
  }

  error(message: string, error?: Error, context?: any): void {
    this.log('error', message, context, error);
  }

  warn(message: string, context?: any): void {
    this.log('warn', message, context);
  }

  debug(message: string, context?: any): void {
    this.log('debug', message, context);
  }
}

export const logger = new Logger();
