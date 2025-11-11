/**
 * Logger Utility
 * Provides structured logging for the Apollo Gateway
 */
type LogLevel = 'error' | 'warn' | 'info' | 'debug';
declare class Logger {
    constructor(level?: LogLevel);
    private log;
    info(message: string, context?: any): void;
    error(message: string, error?: Error, context?: any): void;
    warn(message: string, context?: any): void;
    debug(message: string, context?: any): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map