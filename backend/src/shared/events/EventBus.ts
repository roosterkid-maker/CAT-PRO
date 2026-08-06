import type { DomainEvent } from "./DomainEvent";

type EventHandler<T> = (
  event: DomainEvent<T>,
) => void | Promise<void>;

export class EventBus {
  private readonly handlers =
    new Map<
      string,
      EventHandler<unknown>[]
    >();

  subscribe<T>(
    eventName: string,
    handler: EventHandler<T>,
  ): void {
    const current =
      this.handlers.get(eventName) ??
      [];

    current.push(
      handler as EventHandler<unknown>,
    );

    this.handlers.set(
      eventName,
      current,
    );
  }

  async publish<T>(
    event: DomainEvent<T>,
  ): Promise<void> {
    const handlers =
      this.handlers.get(
        event.name,
      ) ?? [];

    for (const handler of handlers) {
      await handler(event);
    }
  }
}

export const eventBus =
  new EventBus();