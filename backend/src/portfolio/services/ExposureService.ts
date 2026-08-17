import {
  exposureLimits,
} from "../config/exposure";

import type {
  ExchangeExposureSnapshot,
  ExposureHealth,
  ExposureSnapshot,
  MarketExposureSnapshot,
  PositionExposureSnapshot,
  ProposedExposureAssessment,
  ProposedExposureRequest,
} from "../models/ExposureSnapshot";

import {
  portfolioService,
} from "./PortfolioService";

import {
  positionService,
} from "./PositionService";

export class ExposureService {
  getSnapshot(
    now =
      Date.now(),
  ): ExposureSnapshot {
    const portfolio =
      portfolioService
        .getSnapshot(
          now,
        );

    const positions =
      positionService
        .getSnapshot(
          now,
        );

    const capitalBase =
      this.resolveCapitalBase(
        portfolio
          .capital
          .accountCurrentCapital,

        portfolio
          .capital
          .tradableCapitalUsdt,
      );

    const positionExposure =
      positions.open
        .map(
          (
            position,
          ) => {
            const exposurePercent =
              this.percentage(
                position.capital,
                capitalBase,
              );

            return {
              positionId:
                position.id,

              market:
                position.market,

              buyExchange:
                position.buyExchange,

              sellExchange:
                position.sellExchange,

              capital:
                this.round(
                  position.capital,
                ),

              exposurePercent,

              limitPercent:
                exposureLimits
                  .maximumSinglePositionPercent,

              utilizationPercentOfLimit:
                this.limitUtilization(
                  exposurePercent,

                  exposureLimits
                    .maximumSinglePositionPercent,
                ),

              health:
                this.getHealth(
                  exposurePercent,

                  exposureLimits
                    .maximumSinglePositionPercent,
                ),
            } satisfies PositionExposureSnapshot;
          },
        );

    const exchangeExposure =
      this.buildExchangeExposure(
        positions.open,
        capitalBase,
      );

    const marketExposure =
      this.buildMarketExposure(
        positions.open,
        capitalBase,
      );

    const totalOpenCapital =
      positions
        .summary
        .openCapital;

    const totalOpenCapitalPercent =
      this.percentage(
        totalOpenCapital,
        capitalBase,
      );

    const totalOpenCapitalHealth =
      this.getHealth(
        totalOpenCapitalPercent,

        exposureLimits
          .maximumTotalOpenCapitalPercent,
      );

    const warnings:
      string[] =
      [];

    const blockingReasons:
      string[] =
      [];

    this.collectHealthMessages(
      totalOpenCapitalHealth,

      `Total open capital is ${totalOpenCapitalPercent}% of the portfolio capital base.`,

      warnings,
      blockingReasons,
    );

    for (
      const exchange
      of exchangeExposure
    ) {
      this.collectHealthMessages(
        exchange.health,

        `${exchange.exchange} exposure is ${exchange.exposurePercent}% of the portfolio capital base.`,

        warnings,
        blockingReasons,
      );
    }

    for (
      const market
      of marketExposure
    ) {
      this.collectHealthMessages(
        market.health,

        `${market.market} concentration is ${market.exposurePercent}% of the portfolio capital base.`,

        warnings,
        blockingReasons,
      );
    }

    for (
      const position
      of positionExposure
    ) {
      this.collectHealthMessages(
        position.health,

        `Position ${position.positionId} uses ${position.exposurePercent}% of the portfolio capital base.`,

        warnings,
        blockingReasons,
      );
    }

    const allHealth = [
      totalOpenCapitalHealth,

      ...exchangeExposure
        .map(
          (item) =>
            item.health,
        ),

      ...marketExposure
        .map(
          (item) =>
            item.health,
        ),

      ...positionExposure
        .map(
          (item) =>
            item.health,
        ),
    ];

    return {
      generatedAt:
        now,

      capitalBase:
        this.round(
          capitalBase,
        ),

      limits: {
        ...exposureLimits,
      },

      summary: {
        openPositions:
          positions
            .summary
            .openPositions,

        totalOpenCapital:
          this.round(
            totalOpenCapital,
          ),

        totalOpenCapitalPercent,

        totalOpenCapitalHealth,

        highestExchangeExposurePercent:
          this.maximumPercent(
            exchangeExposure
              .map(
                (item) =>
                  item.exposurePercent,
              ),
          ),

        highestMarketExposurePercent:
          this.maximumPercent(
            marketExposure
              .map(
                (item) =>
                  item.exposurePercent,
              ),
          ),

        highestPositionExposurePercent:
          this.maximumPercent(
            positionExposure
              .map(
                (item) =>
                  item.exposurePercent,
              ),
          ),

        warningCount:
          allHealth
            .filter(
              (health) =>
                health ===
                "WARNING",
            )
            .length,

        blockedCount:
          allHealth
            .filter(
              (health) =>
                health ===
                "BLOCKED",
            )
            .length,

        canOpenNewPositions:
          blockingReasons.length ===
          0,
      },

      exchanges:
        exchangeExposure,

      markets:
        marketExposure,

      positions:
        positionExposure,

      warnings:
        Array.from(
          new Set(
            warnings,
          ),
        ),

      blockingReasons:
        Array.from(
          new Set(
            blockingReasons,
          ),
        ),
    };
  }

  assessProposedExposure(
    request:
      ProposedExposureRequest,

    now =
      Date.now(),
  ): ProposedExposureAssessment {
    const validation =
      this.validateProposal(
        request,
      );

    if (
      validation.length >
      0
    ) {
      return {
        approved:
          false,

        health:
          "BLOCKED",

        reasons:
          validation,

        projected: {
          totalOpenCapitalPercent:
            0,

          positionExposurePercent:
            0,

          buyExchangeExposurePercent:
            0,

          sellExchangeExposurePercent:
            0,

          marketExposurePercent:
            0,
        },
      };
    }

    const snapshot =
      this.getSnapshot(
        now,
      );

    const positionSnapshot =
      positionService
        .getSnapshot(
          now,
        );

    const capitalBase =
      snapshot.capitalBase;

    if (
      capitalBase <=
      0
    ) {
      return {
        approved:
          false,

        health:
          "BLOCKED",

        reasons: [
          "Portfolio capital base is unavailable or zero.",
        ],

        projected: {
          totalOpenCapitalPercent:
            0,

          positionExposurePercent:
            0,

          buyExchangeExposurePercent:
            0,

          sellExchangeExposurePercent:
            0,

          marketExposurePercent:
            0,
        },
      };
    }

    const market =
      request.market
        .trim()
        .toUpperCase();

    const buyExchange =
      request.buyExchange
        .trim()
        .toLowerCase();

    const sellExchange =
      request.sellExchange
        .trim()
        .toLowerCase();

    const currentBuyExposure =
      this.currentExchangeExposure(
        snapshot,
        buyExchange,
      );

    const currentSellExposure =
      this.currentExchangeExposure(
        snapshot,
        sellExchange,
      );

    const currentMarketCapital =
      positionSnapshot
        .open
        .filter(
          (
            position,
          ) =>
            position.market
              .trim()
              .toUpperCase() ===
            market,
        )
        .reduce(
          (
            total,
            position,
          ) =>
            total +
            position.capital,
          0,
        );

    /*
     * Until inventory-side asset valuation
     * is introduced, proposed sell-side
     * exposure is represented conservatively
     * using the requested capital.
     */
    const sellNotional =
      request.capital;

    const projected = {
      totalOpenCapitalPercent:
        this.percentage(
          snapshot
            .summary
            .totalOpenCapital +
            request.capital,

          capitalBase,
        ),

      positionExposurePercent:
        this.percentage(
          request.capital,
          capitalBase,
        ),

      buyExchangeExposurePercent:
        this.percentage(
          currentBuyExposure +
            request.capital,

          capitalBase,
        ),

      sellExchangeExposurePercent:
        this.percentage(
          currentSellExposure +
            sellNotional,

          capitalBase,
        ),

      marketExposurePercent:
        this.percentage(
          currentMarketCapital +
            request.capital,

          capitalBase,
        ),
    };

    const checks = [
      {
        value:
          projected
            .totalOpenCapitalPercent,

        limit:
          exposureLimits
            .maximumTotalOpenCapitalPercent,

        reason:
          "Projected total open capital exceeds the configured portfolio exposure limit.",
      },

      {
        value:
          projected
            .positionExposurePercent,

        limit:
          exposureLimits
            .maximumSinglePositionPercent,

        reason:
          "Requested position exceeds the configured single-position exposure limit.",
      },

      {
        value:
          projected
            .buyExchangeExposurePercent,

        limit:
          exposureLimits
            .maximumExchangeExposurePercent,

        reason:
          `Projected ${buyExchange} exposure exceeds the configured exchange limit.`,
      },

      {
        value:
          projected
            .sellExchangeExposurePercent,

        limit:
          exposureLimits
            .maximumExchangeExposurePercent,

        reason:
          `Projected ${sellExchange} exposure exceeds the configured exchange limit.`,
      },

      {
        value:
          projected
            .marketExposurePercent,

        limit:
          exposureLimits
            .maximumMarketExposurePercent,

        reason:
          `Projected ${market} concentration exceeds the configured market limit.`,
      },
    ];

    const blocked =
      checks
        .filter(
          (
            check,
          ) =>
            check.value >
            check.limit,
        );

    if (
      blocked.length >
      0
    ) {
      return {
        approved:
          false,

        health:
          "BLOCKED",

        reasons:
          blocked
            .map(
              (
                check,
              ) =>
                check.reason,
            ),

        projected,
      };
    }

    const warning =
      checks
        .some(
          (
            check,
          ) =>
            this.getHealth(
              check.value,
              check.limit,
            ) ===
            "WARNING",
        );

    return {
      approved:
        true,

      health:
        warning
          ? "WARNING"
          : "HEALTHY",

      reasons:
        warning
          ? [
              "Projected exposure is within limits but approaching one or more configured thresholds.",
            ]
          : [
              "Projected exposure is within all configured limits.",
            ],

      projected,
    };
  }

  private buildExchangeExposure(
    positions:
      ReturnType<
        typeof positionService.getSnapshot
      >["open"],

    capitalBase:
      number,
  ): ExchangeExposureSnapshot[] {
    const totals =
      new Map<
        string,
        {
          referencedCapital:
            number;

          positionIds:
            Set<string>;
        }
      >();

    for (
      const position
      of positions
    ) {
      this.addExchangeExposure(
        totals,

        position.buyExchange,

        position.capital,

        position.id,
      );

      this.addExchangeExposure(
        totals,

        position.sellExchange,

        position.quantity *
          position.expectedSellPrice,

        position.id,
      );
    }

    return Array.from(
      totals.entries(),
    )
      .map(
        (
          [
            exchange,
            data,
          ],
        ) => {
          const exposurePercent =
            this.percentage(
              data.referencedCapital,
              capitalBase,
            );

          return {
            exchange,

            referencedCapital:
              this.round(
                data.referencedCapital,
              ),

            exposurePercent,

            limitPercent:
              exposureLimits
                .maximumExchangeExposurePercent,

            utilizationPercentOfLimit:
              this.limitUtilization(
                exposurePercent,

                exposureLimits
                  .maximumExchangeExposurePercent,
              ),

            openPositions:
              data
                .positionIds
                .size,

            health:
              this.getHealth(
                exposurePercent,

                exposureLimits
                  .maximumExchangeExposurePercent,
              ),
          } satisfies ExchangeExposureSnapshot;
        },
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.exposurePercent -
          first.exposurePercent,
      );
  }

  private buildMarketExposure(
    positions:
      ReturnType<
        typeof positionService.getSnapshot
      >["open"],

    capitalBase:
      number,
  ): MarketExposureSnapshot[] {
    const totals =
      new Map<
        string,
        {
          capital:
            number;

          count:
            number;
        }
      >();

    for (
      const position
      of positions
    ) {
      const market =
        position.market
          .trim()
          .toUpperCase();

      const current =
        totals.get(
          market,
        ) ?? {
          capital:
            0,

          count:
            0,
        };

      current.capital +=
        position.capital;

      current.count +=
        1;

      totals.set(
        market,
        current,
      );
    }

    return Array.from(
      totals.entries(),
    )
      .map(
        (
          [
            market,
            data,
          ],
        ) => {
          const exposurePercent =
            this.percentage(
              data.capital,
              capitalBase,
            );

          return {
            market,

            capital:
              this.round(
                data.capital,
              ),

            exposurePercent,

            limitPercent:
              exposureLimits
                .maximumMarketExposurePercent,

            utilizationPercentOfLimit:
              this.limitUtilization(
                exposurePercent,

                exposureLimits
                  .maximumMarketExposurePercent,
              ),

            openPositions:
              data.count,

            health:
              this.getHealth(
                exposurePercent,

                exposureLimits
                  .maximumMarketExposurePercent,
              ),
          } satisfies MarketExposureSnapshot;
        },
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.exposurePercent -
          first.exposurePercent,
      );
  }

  private addExchangeExposure(
    totals:
      Map<
        string,
        {
          referencedCapital:
            number;

          positionIds:
            Set<string>;
        }
      >,

    exchange:
      string,

    amount:
      number,

    positionId:
      string,
  ): void {
    const normalized =
      exchange
        .trim()
        .toLowerCase();

    const current =
      totals.get(
        normalized,
      ) ?? {
        referencedCapital:
          0,

        positionIds:
          new Set<string>(),
      };

    current.referencedCapital +=
      Number.isFinite(
        amount,
      ) &&
      amount >
        0
        ? amount
        : 0;

    current.positionIds
      .add(
        positionId,
      );

    totals.set(
      normalized,
      current,
    );
  }

  private currentExchangeExposure(
    snapshot:
      ExposureSnapshot,

    exchange:
      string,
  ): number {
    return (
      snapshot.exchanges
        .find(
          (
            item,
          ) =>
            item.exchange ===
            exchange,
        )
        ?.referencedCapital ??
      0
    );
  }

  private resolveCapitalBase(
    accountCurrentCapital:
      number,

    tradableCapital:
      number,
  ): number {
    if (
      Number.isFinite(
        accountCurrentCapital,
      ) &&
      accountCurrentCapital >
        0
    ) {
      return accountCurrentCapital;
    }

    if (
      Number.isFinite(
        tradableCapital,
      ) &&
      tradableCapital >
        0
    ) {
      return tradableCapital;
    }

    return 0;
  }

  private getHealth(
    valuePercent:
      number,

    limitPercent:
      number,
  ): ExposureHealth {
    if (
      valuePercent >
      limitPercent
    ) {
      return "BLOCKED";
    }

    const warningLevel =
      limitPercent *
      (
        exposureLimits
          .warningThresholdPercentOfLimit /
        100
      );

    if (
      valuePercent >=
      warningLevel
    ) {
      return "WARNING";
    }

    return "HEALTHY";
  }

  private collectHealthMessages(
    health:
      ExposureHealth,

    message:
      string,

    warnings:
      string[],

    blockingReasons:
      string[],
  ): void {
    if (
      health ===
      "WARNING"
    ) {
      warnings.push(
        message,
      );
    }

    if (
      health ===
      "BLOCKED"
    ) {
      blockingReasons.push(
        message,
      );
    }
  }

  private validateProposal(
    request:
      ProposedExposureRequest,
  ): string[] {
    const reasons:
      string[] =
      [];

    if (
      !Number.isFinite(
        request.capital,
      ) ||
      request.capital <=
        0
    ) {
      reasons.push(
        "Proposed capital must be a positive finite number.",
      );
    }

    if (
      !request.market
        .trim()
    ) {
      reasons.push(
        "Market is required for exposure assessment.",
      );
    }

    if (
      !request.buyExchange
        .trim()
    ) {
      reasons.push(
        "Buy exchange is required for exposure assessment.",
      );
    }

    if (
      !request.sellExchange
        .trim()
    ) {
      reasons.push(
        "Sell exchange is required for exposure assessment.",
      );
    }

    return reasons;
  }

  private percentage(
    numerator:
      number,

    denominator:
      number,
  ): number {
    if (
      denominator <=
      0
    ) {
      return 0;
    }

    return this.round(
      (
        numerator /
        denominator
      ) *
        100,

      4,
    );
  }

  private limitUtilization(
    value:
      number,

    limit:
      number,
  ): number {
    if (
      limit <=
      0
    ) {
      return 0;
    }

    return this.round(
      (
        value /
        limit
      ) *
        100,

      2,
    );
  }

  private maximumPercent(
    values:
      number[],
  ): number {
    if (
      values.length ===
      0
    ) {
      return 0;
    }

    return Math.max(
      ...values,
    );
  }

  private round(
    value:
      number,

    decimalPlaces =
      2,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      decimalPlaces;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }
}

export const exposureService =
  new ExposureService();