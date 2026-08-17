const REDACTED =
  "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(api[_-]?key|api[_-]?secret|secret|signature|authorization|password|passphrase|private[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|cookie)([_-]|$)/i;

const SENSITIVE_ENVIRONMENT_KEY_PATTERN =
  /(API_KEY|API_SECRET|SECRET|TOKEN|PASSWORD|PASSPHRASE|PRIVATE_KEY)$/i;

export interface SensitiveDataRedactionDiagnostics {
  configuredSensitiveEnvironmentVariables:
    string[];

  selfTestPassed:
    boolean;

  redactedMarker:
    "[REDACTED]";
}

export class SensitiveDataRedactor {
  redactString(
    value:
      string,
  ): string {
    let output =
      value;

    /*
     * If a configured secret somehow appears
     * inside an error/log string, replace the
     * actual value.
     */
    for (
      const secret
      of this.getSensitiveEnvironmentValues()
    ) {
      output =
        output
          .split(
            secret,
          )
          .join(
            REDACTED,
          );
    }

    /*
     * Query-string style secrets.
     */
    output =
      output.replace(
        /([?&](?:signature|api[_-]?key|api[_-]?secret|token)=)[^&\s]+/gi,

        `$1${REDACTED}`,
      );

    /*
     * Header / JSON / assignment style secrets.
     */
    output =
      output.replace(
        /("?(?:x-auth-apikey|x-auth-signature|x-mbx-apikey|authorization|api[_-]?key|api[_-]?secret|password|passphrase|private[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|cookie)"?\s*[:=]\s*["']?)[^,"'\s}]+/gi,

        `$1${REDACTED}`,
      );

    return output;
  }

  sanitize<T>(
    value:
      T,
  ): T {
    return this.sanitizeValue(
      value,

      new WeakSet<object>(),

      0,
    ) as T;
  }

  stringifyForLog(
    value:
      unknown,
  ): string {
    const sanitized =
      this.sanitize(
        value,
      );

    try {
      return JSON.stringify(
        sanitized,
      );
    } catch {
      return this.redactString(
        String(
          sanitized,
        ),
      );
    }
  }

  getDiagnostics():
    SensitiveDataRedactionDiagnostics {
    /*
     * Synthetic self-test only.
     *
     * Real environment secret values are NEVER
     * returned by diagnostics.
     */
    const sampleSecret =
      "build10-secret-value";

    const sample = {
      apiKey:
        sampleSecret,

      nested: {
        signature:
          sampleSecret,
      },

      safe:
        "visible",
    };

    const sanitized =
      this.sanitize(
        sample,
      );

    return {
      configuredSensitiveEnvironmentVariables:
        this.getSensitiveEnvironmentVariableNames(),

      selfTestPassed:
        sanitized.apiKey ===
          REDACTED &&
        sanitized
          .nested
          .signature ===
          REDACTED &&
        sanitized.safe ===
          "visible",

      redactedMarker:
        REDACTED,
    };
  }

  private sanitizeValue(
    value:
      unknown,

    seen:
      WeakSet<object>,

    depth:
      number,
  ): unknown {
    if (
      depth >
      12
    ) {
      return "[MAX_DEPTH]";
    }

    if (
      typeof value ===
      "string"
    ) {
      return this.redactString(
        value,
      );
    }

    if (
      value ===
        null ||
      typeof value ===
        "number" ||
      typeof value ===
        "boolean" ||
      typeof value ===
        "undefined" ||
      typeof value ===
        "bigint"
    ) {
      return value;
    }

    if (
      value instanceof Error
    ) {
      return {
        name:
          value.name,

        message:
          this.redactString(
            value.message,
          ),

        ...(value.stack
          ? {
              stack:
                this.redactString(
                  value.stack,
                ),
            }
          : {}),
      };
    }

    if (
      Array.isArray(
        value,
      )
    ) {
      return value.map(
        (
          item,
        ) =>
          this.sanitizeValue(
            item,
            seen,
            depth + 1,
          ),
      );
    }

    if (
      typeof value ===
      "object"
    ) {
      if (
        seen.has(
          value,
        )
      ) {
        return "[CIRCULAR]";
      }

      seen.add(
        value,
      );

      const output:
        Record<
          string,
          unknown
        > =
        {};

      for (
        const [
          key,
          item,
        ]
        of Object.entries(
          value,
        )
      ) {
        output[key] =
          this.isSensitiveKey(
            key,
          )
            ? REDACTED
            : this.sanitizeValue(
                item,
                seen,
                depth + 1,
              );
      }

      return output;
    }

    return this.redactString(
      String(
        value,
      ),
    );
  }

  private isSensitiveKey(
    key:
      string,
  ): boolean {
    const normalized =
      key
        .trim()
        .toLowerCase();

    if (
      normalized ===
        "x-auth-apikey" ||
      normalized ===
        "x-auth-signature" ||
      normalized ===
        "x-mbx-apikey" ||
      normalized ===
        "authorization" ||
      normalized ===
        "set-cookie"
    ) {
      return true;
    }

    return SENSITIVE_KEY_PATTERN
      .test(
        normalized,
      );
  }

  private getSensitiveEnvironmentVariableNames():
    string[] {
    return Object
      .keys(
        process.env,
      )
      .filter(
        (
          key,
        ) =>
          SENSITIVE_ENVIRONMENT_KEY_PATTERN
            .test(
              key,
            ) &&
          Boolean(
            process.env[
              key
            ]?.trim(),
          ),
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.localeCompare(
            second,
          ),
      );
  }

  private getSensitiveEnvironmentValues():
    string[] {
    return this
      .getSensitiveEnvironmentVariableNames()
      .map(
        (
          key,
        ) =>
          process.env[
            key
          ]?.trim() ??
          "",
      )
      .filter(
        (
          value,
        ) =>
          value.length >=
          4,
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.length -
          first.length,
      );
  }
}

export const sensitiveDataRedactor =
  new SensitiveDataRedactor();