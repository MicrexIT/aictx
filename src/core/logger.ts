export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface LoggerOptions {
  debug?: boolean;
}

class QuietLogger implements Logger {
  readonly #debugEnabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.#debugEnabled = options.debug === true;
  }

  debug(message: string): void {
    if (this.#debugEnabled) {
      process.stderr.write(`${message}\n`);
    }
  }

  info(_message: string): void {}

  warn(_message: string): void {}

  error(_message: string): void {}
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return new QuietLogger(options);
}

export const logger: Logger = createLogger();
