export type BybitSubscriptionState =
  | "SUBSCRIBED"
  | "ACTIVE"
  | "SILENT";

export interface BybitSubscriptionRecord {
  market: string;

  subscribedAt: number;

  firstDataAt: number | null;

  lastDataAt: number | null;

  messagesReceived: number;

  state: BybitSubscriptionState;

  ageSinceSubscribeMs: number;

  ageSinceLastDataMs: number | null;

  recentInterUpdateGapsMs: number[];

  gapSamples: number;

  p50InterUpdateGapMs: number | null;

  p95InterUpdateGapMs: number | null;

  maximumInterUpdateGapMs: number | null;
}

export interface BybitSubscriptionAuditReport {
  generatedAt: number;

  requested: number;

  active: number;

  silent: number;

  neverReceivedData: number;

  receivedData: number;

  subscriptionAcks: number;

  subscriptionRejects: number;

  records: BybitSubscriptionRecord[];
}

export interface BybitSubscriptionEventEvidence {
  readonly market: string;

  readonly messagesReceived: number;

  readonly lastDataAt: number | null;

  readonly recentInterUpdateGapsMs:
    readonly number[];
}

interface MutableRecord {
  market: string;

  subscribedAt: number;

  firstDataAt: number | null;

  lastDataAt: number | null;

  messagesReceived: number;

  recentInterUpdateGapsMs: number[];
}

export class BybitSubscriptionAuditService {
  private static readonly SILENT_AFTER_MS =
    30_000;

  /*
   * Event history only.
   *
   * No timer-generated quality samples are stored.
   */
  private static readonly MAXIMUM_GAP_SAMPLES =
    30;

  private readonly records =
    new Map<
      string,
      MutableRecord
    >();

  private subscriptionAcks =
    0;

  private subscriptionRejects =
    0;

  recordSubscribe(
    markets:
      readonly string[],

    now =
      Date.now(),
  ): void {
    for (
      const rawMarket
      of markets
    ) {
      const market =
        this.normalize(
          rawMarket,
        );

      if (
        !market
      ) {
        continue;
      }

      const existing =
        this.records.get(
          market,
        );

      if (
        existing
      ) {
        /*
         * Targeted re-subscription starts a new
         * subscription observation period but does not
         * erase genuine historical event-gap evidence.
         */
        existing.subscribedAt =
          now;

        continue;
      }

      this.records.set(
        market,
        {
          market,

          subscribedAt:
            now,

          firstDataAt:
            null,

          lastDataAt:
            null,

          messagesReceived:
            0,

          recentInterUpdateGapsMs:
            [],
        },
      );
    }
  }

  /*
   * Record only successfully reconstructed/published
   * order books.
   *
   * This means invalid/crossed/empty messages cannot
   * improve execution-quality evidence.
   */
  recordData(
    market:
      string,

    now =
      Date.now(),
  ): void {
    const normalized =
      this.normalize(
        market,
      );

    if (
      !normalized
    ) {
      return;
    }

    const record =
      this.records.get(
        normalized,
      ) ?? {
        market:
          normalized,

        subscribedAt:
          now,

        firstDataAt:
          null,

        lastDataAt:
          null,

        messagesReceived:
          0,

        recentInterUpdateGapsMs:
          [],
      };

    if (
      record.lastDataAt !==
      null
    ) {
      const gapMs =
        Math.max(
          0,
          now -
            record.lastDataAt,
        );

      record
        .recentInterUpdateGapsMs
        .push(
          gapMs,
        );

      while (
        record
          .recentInterUpdateGapsMs
          .length >
        BybitSubscriptionAuditService
          .MAXIMUM_GAP_SAMPLES
      ) {
        record
          .recentInterUpdateGapsMs
          .shift();
      }
    }

    record.firstDataAt ??=
      now;

    record.lastDataAt =
      now;

    record.messagesReceived +=
      1;

    this.records.set(
      normalized,
      record,
    );
  }

  recordAck(): void {
    this.subscriptionAcks +=
      1;
  }

  recordReject(): void {
    this.subscriptionRejects +=
      1;
  }

  remove(
    markets:
      readonly string[],
  ): void {
    for (
      const market
      of markets
    ) {
      this.records.delete(
        this.normalize(
          market,
        ),
      );
    }
  }

  clear(): void {
    this.records.clear();

    this.subscriptionAcks =
      0;

    this.subscriptionRejects =
      0;
  }

  /**
   * Visit the authoritative event evidence without first building the much
   * heavier operator-facing audit report. The callback is synchronous, so a
   * Node event cannot mutate a record while it is being inspected. Exposing
   * the gap list as readonly keeps this path allocation-free and preserves
   * the audit service as its sole mutation owner.
   */
  forEachEventEvidence(
    visitor:
      (
        evidence:
          BybitSubscriptionEventEvidence,
      ) => void,
  ): void {
    for (
      const record
      of this.records.values()
    ) {
      visitor(
        record,
      );
    }
  }

  getReport(
    now =
      Date.now(),
  ): BybitSubscriptionAuditReport {
    const records =
      Array.from(
        this.records.values(),
      )
        .map(
          (
            record,
          ) => {
            const ageSinceSubscribeMs =
              Math.max(
                0,
                now -
                  record.subscribedAt,
              );

            const ageSinceLastDataMs =
              record.lastDataAt ===
                null
                ? null
                : Math.max(
                    0,
                    now -
                      record.lastDataAt,
                  );

            let state:
              BybitSubscriptionState =
              "SUBSCRIBED";

            if (
              record.lastDataAt !==
                null &&
              ageSinceLastDataMs !==
                null &&
              ageSinceLastDataMs <=
                BybitSubscriptionAuditService
                  .SILENT_AFTER_MS
            ) {
              state =
                "ACTIVE";
            } else if (
              ageSinceSubscribeMs >
              BybitSubscriptionAuditService
                .SILENT_AFTER_MS
            ) {
              state =
                "SILENT";
            }

            const gaps = [
              ...record
                .recentInterUpdateGapsMs,
            ];

            return {
              market:
                record.market,

              subscribedAt:
                record.subscribedAt,

              firstDataAt:
                record.firstDataAt,

              lastDataAt:
                record.lastDataAt,

              messagesReceived:
                record.messagesReceived,

              state,

              ageSinceSubscribeMs,

              ageSinceLastDataMs,

              recentInterUpdateGapsMs:
                gaps,

              gapSamples:
                gaps.length,

              p50InterUpdateGapMs:
                this.percentile(
                  gaps,
                  0.50,
                ),

              p95InterUpdateGapMs:
                this.percentile(
                  gaps,
                  0.95,
                ),

              maximumInterUpdateGapMs:
                gaps.length >
                  0
                  ? Math.max(
                      ...gaps,
                    )
                  : null,
            };
          },
        )
        .sort(
          (
            first,
            second,
          ) => {
            const rank =
              (
                state:
                  BybitSubscriptionState,
              ) =>
                state ===
                "SILENT"
                  ? 0
                  : state ===
                      "SUBSCRIBED"
                    ? 1
                    : 2;

            return (
              rank(
                first.state,
              ) -
                rank(
                  second.state,
                ) ||
              first.market
                .localeCompare(
                  second.market,
                )
            );
          },
        );

    return {
      generatedAt:
        now,

      requested:
        records.length,

      active:
        records.filter(
          (
            record,
          ) =>
            record.state ===
            "ACTIVE",
        ).length,

      silent:
        records.filter(
          (
            record,
          ) =>
            record.state ===
            "SILENT",
        ).length,

      neverReceivedData:
        records.filter(
          (
            record,
          ) =>
            record.firstDataAt ===
            null,
        ).length,

      receivedData:
        records.filter(
          (
            record,
          ) =>
            record.firstDataAt !==
            null,
        ).length,

      subscriptionAcks:
        this.subscriptionAcks,

      subscriptionRejects:
        this.subscriptionRejects,

      records,
    };
  }

  private percentile(
    values:
      readonly number[],

    percentile:
      number,
  ): number | null {
    if (
      values.length ===
      0
    ) {
      return null;
    }

    const sorted = [
      ...values,
    ].sort(
      (
        first,
        second,
      ) =>
        first -
        second,
    );

    const index =
      Math.min(
        sorted.length -
          1,
        Math.max(
          0,
          Math.ceil(
            percentile *
            sorted.length,
          ) -
            1,
        ),
      );

    return sorted[
      index
    ] ??
    null;
  }

  private normalize(
    market:
      string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }
}

export const bybitSubscriptionAuditService =
  new BybitSubscriptionAuditService();
