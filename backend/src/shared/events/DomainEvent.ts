export interface DomainEvent<TPayload = unknown> {
  id: string;

  name: string;

  timestamp: number;

  payload: TPayload;
}