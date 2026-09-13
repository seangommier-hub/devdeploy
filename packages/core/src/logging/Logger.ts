export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Minimal leveled logger. Every DevDeploy process (server, agent) uses this instead of bare console calls. */
export class Logger {
  constructor(
    private readonly scope: string,
    private readonly minLevel: LogLevel = "info",
  ) {}

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const line = {
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...(meta ? { meta } : {}),
    };
    const target = level === "error" || level === "warn" ? process.stderr : process.stdout;
    target.write(`${JSON.stringify(line)}\n`);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("error", message, meta);
  }

  child(subScope: string): Logger {
    return new Logger(`${this.scope}:${subScope}`, this.minLevel);
  }
}
