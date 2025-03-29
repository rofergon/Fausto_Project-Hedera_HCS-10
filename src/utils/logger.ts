// src/utils/logger.ts

// Basic console logger implementation
// TODO: Enhance with levels, formatting, potential file output etc. if needed

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
    module?: string;
    level?: LogLevel;
    prettyPrint?: boolean; // Placeholder, not implemented
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

export class Logger {
    private static instances: Map<string, Logger> = new Map();
    private moduleName: string;
    private minLevel: number;

    private constructor(options: LoggerOptions = {}) {
        this.moduleName = options.module || 'Default';
        this.minLevel = LOG_LEVELS[options.level || 'info'];
    }

    // Singleton pattern per module name
    public static getInstance(options: LoggerOptions = {}): Logger {
        const moduleKey = options.module || 'Default';
        if (!Logger.instances.has(moduleKey)) {
            Logger.instances.set(moduleKey, new Logger(options));
        }
        // Optionally update level if instance exists?
        return Logger.instances.get(moduleKey)!;
    }

    private log(level: LogLevel, message: string, ...args: any[]) {
        if (LOG_LEVELS[level] >= this.minLevel) {
            const timestamp = new Date().toISOString();
            const levelUpper = level.toUpperCase();
            console.log(`[${timestamp}] [${levelUpper}] [${this.moduleName}] ${message}`, ...args);
        }
    }

    debug(message: string, ...args: any[]) {
        this.log('debug', message, ...args);
    }

    info(message: string, ...args: any[]) {
        this.log('info', message, ...args);
    }

    warn(message: string, ...args: any[]) {
        this.log('warn', message, ...args);
    }

    error(message: string, ...args: any[]) {
        this.log('error', message, ...args);
    }
} 