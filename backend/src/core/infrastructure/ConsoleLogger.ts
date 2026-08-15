import type {
  Logger,
} from "../contracts/Logger";

import {
  sensitiveDataRedactor,
} from "../security/SensitiveDataRedactor";

export class ConsoleLogger
  implements Logger
{
  info(
    message:
      string,
  ): void {
    console.log(
      `[INFO] ${sensitiveDataRedactor.redactString(
        message,
      )}`,
    );
  }

  warn(
    message:
      string,
  ): void {
    console.warn(
      `[WARN] ${sensitiveDataRedactor.redactString(
        message,
      )}`,
    );
  }

  error(
    message:
      string,

    error?:
      unknown,
  ): void {
    const safeMessage =
      sensitiveDataRedactor
        .redactString(
          message,
        );

    if (
      error ===
      undefined
    ) {
      console.error(
        `[ERROR] ${safeMessage}`,
      );

      return;
    }

    console.error(
      `[ERROR] ${safeMessage}`,

      sensitiveDataRedactor
        .sanitize(
          error,
        ),
    );
  }

  debug(
    message:
      string,
  ): void {
    console.debug(
      `[DEBUG] ${sensitiveDataRedactor.redactString(
        message,
      )}`,
    );
  }
}

export const logger =
  new ConsoleLogger();