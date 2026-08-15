import type {
  StrategyController,
} from "../contracts/StrategyController";

import type {
  StrategyId,
} from "../models/StrategyMetadata";

import type {
  StrategyRegistrySnapshot,
} from "../models/StrategyRuntimeSnapshot";

const STRATEGY_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class StrategyRegistry {
  private readonly controllers =
    new Map<
      StrategyId,
      StrategyController
    >();

  register(
    controller:
      StrategyController,
  ): void {
    const metadata =
      controller.getMetadata();

    const strategyId =
      this.normalizeStrategyId(
        metadata.id,
      );

    if (
      metadata.id !==
      strategyId
    ) {
      throw new Error(
        `Strategy ID must already be normalized: ${metadata.id}`,
      );
    }

    if (
      !STRATEGY_ID_PATTERN.test(
        strategyId,
      )
    ) {
      throw new Error(
        `Invalid strategy ID: ${metadata.id}`,
      );
    }

    if (
      this.controllers.has(
        strategyId,
      )
    ) {
      throw new Error(
        `Strategy is already registered: ${strategyId}`,
      );
    }

    if (
      !Number.isSafeInteger(
        metadata.strategyNumber,
      ) ||
      metadata.strategyNumber <=
        0
    ) {
      throw new Error(
        `Strategy number must be a positive safe integer: ${strategyId}`,
      );
    }

    const duplicateNumber =
      this.getControllers()
        .find(
          (registeredController) =>
            registeredController
              .getMetadata()
              .strategyNumber ===
            metadata.strategyNumber,
        );

    if (duplicateNumber) {
      throw new Error(
        `Strategy number is already registered: ${metadata.strategyNumber} (${duplicateNumber.getMetadata().id})`,
      );
    }

    this.controllers.set(
      strategyId,
      controller,
    );
  }

  get(
    strategyId:
      string,
  ): StrategyController | null {
    const normalized =
      this.normalizeStrategyId(
        strategyId,
      );

    return this.controllers.get(
      normalized,
    ) ??
      null;
  }

  getControllers():
    readonly StrategyController[] {
    return [
      ...this.controllers.values(),
    ].sort(
      (
        first,
        second,
      ) => {
        const firstMetadata =
          first.getMetadata();

        const secondMetadata =
          second.getMetadata();

        return (
          firstMetadata.strategyNumber -
            secondMetadata.strategyNumber ||
          firstMetadata.id.localeCompare(
            secondMetadata.id,
          )
        );
      },
    );
  }

  getSnapshot(
    now =
      Date.now(),
  ): StrategyRegistrySnapshot {
    const strategies =
      this.getControllers()
        .map(
          (controller) => ({
            metadata:
              controller.getMetadata(),

            runtime:
              controller.getRuntimeSnapshot(
                now,
              ),
          }),
        );

    return immutableClone({
      generatedAt:
        now,

      strategyCount:
        strategies.length,

      strategies,
    });
  }

  private normalizeStrategyId(
    strategyId:
      string,
  ): string {
    return strategyId
      .trim()
      .toLowerCase();
  }
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nestedValue
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nestedValue,
    );
  }

  return Object.freeze(
    value,
  );
}
