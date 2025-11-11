/**
 * Logger Utility
 * Provides structured logging for the Apollo Gateway
 */
class Logger {
    constructor(level = 'info') {
        // Level can be used for filtering in future implementations
        void level;
    }
    log(level, message, context, error) {
        const logEntry = {
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
    info(message, context) {
        this.log('info', message, context);
    }
    error(message, error, context) {
        this.log('error', message, context, error);
    }
    warn(message, context) {
        this.log('warn', message, context);
    }
    debug(message, context) {
        this.log('debug', message, context);
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map