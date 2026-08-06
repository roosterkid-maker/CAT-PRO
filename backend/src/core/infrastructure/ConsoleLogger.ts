import type { Logger } from "../contracts/Logger";

export class ConsoleLogger
  implements Logger
{
  info(
    message: string,
  ): void {
    console.log(
      `[INFO] ${message}`,
    );
  }

  warn(
    message: string,
  ): void {
    console.warn(
      `[WARN] ${message}`,
    );
  }

  error(
    message: string,
    error?: unknown,
  ): void {
    console.error(
      `[ERROR] ${message}`,
      error,
    );
  }

  debug(
    message: string,
  ): void {
    console.debug(
      `[DEBUG] ${message}`,
    );
  }
}

export const logger =
  new ConsoleLogger();