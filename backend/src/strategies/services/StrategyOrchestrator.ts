import type {
  StrategySignalListener,
} from "../contracts/StrategyController";

import type {
  StrategyRegistrySnapshot,
} from "../models/StrategyRuntimeSnapshot";

import {
  immutableStrategySignal,
} from "../models/StrategySignal";

import type {
  StrategySignal,
} from "../models/StrategySignal";

import type {
  StrategyRegistry,
} from "./StrategyRegistry";

/**
 * Phase 1A orchestration is intentionally limited to:
 * - controller lifecycle
 * - read-only signal forwarding
 *
 * It has no execution method and no execution dependencies.
 */
export class StrategyOrchestrator {
  private readonly listeners =
    new Set<
      StrategySignalListener
    >();

  private readonly controllerSubscriptions =
    new Map<
      string,
      () => void
    >();

  private running =
    false;

  constructor(
    private readonly registry:
      StrategyRegistry,
  ) {}

  start():
    void {
    if (
      this.running
    ) {
      return;
    }

    const startedControllers =
      [] as Array<{
        id: string;

        stop(): void;
      }>;

    try {
      for (
        const controller
        of this.registry
          .getControllers()
      ) {
        const metadata =
          controller.getMetadata();

        const unsubscribe =
          controller
            .subscribeToSignals(
              (signal) => {
                this.publishSignal(
                  signal,
                );
              },
            );

        this.controllerSubscriptions
          .set(
            metadata.id,
            unsubscribe,
          );

        controller.start();

        startedControllers.push({
          id:
            metadata.id,

          stop:
            () => {
              controller.stop();
            },
        });
      }

      this.running =
        true;
    } catch (
      error:
        unknown
    ) {
      for (
        const controller
        of startedControllers.reverse()
      ) {
        controller.stop();

        this.controllerSubscriptions
          .get(
            controller.id,
          )?.();

        this.controllerSubscriptions
          .delete(
            controller.id,
          );
      }

      for (
        const unsubscribe
        of this.controllerSubscriptions
          .values()
      ) {
        unsubscribe();
      }

      this.controllerSubscriptions
        .clear();

      throw error;
    }
  }

  stop():
    void {
    if (
      !this.running
    ) {
      return;
    }

    const controllers =
      [
        ...this.registry
          .getControllers(),
      ].reverse();

    for (
      const controller
      of controllers
    ) {
      controller.stop();

      const strategyId =
        controller
          .getMetadata()
          .id;

      this.controllerSubscriptions
        .get(
          strategyId,
        )?.();

      this.controllerSubscriptions
        .delete(
          strategyId,
        );
    }

    this.running =
      false;
  }

  isRunning():
    boolean {
    return this.running;
  }

  getRegistrySnapshot(
    now =
      Date.now(),
  ): StrategyRegistrySnapshot {
    return this.registry
      .getSnapshot(
        now,
      );
  }

  subscribeToSignals(
    listener:
      StrategySignalListener,
  ): () => void {
    this.listeners.add(
      listener,
    );

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }

  private publishSignal(
    signal:
      StrategySignal,
  ): void {
    for (
      const listener
      of this.listeners
    ) {
      try {
        listener(
          immutableStrategySignal(
            signal,
          ),
        );
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[StrategyOrchestrator] Read-only signal listener failed:",
          error instanceof Error
            ? error.message
            : "Unknown strategy signal listener error.",
        );
      }
    }
  }
}
