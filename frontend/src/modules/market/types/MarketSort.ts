export type SortField =
  | "market"
  | "exchange"
  | "lastPrice";

export type SortDirection =
  | "asc"
  | "desc";

export interface MarketSort {
  field: SortField;
  direction: SortDirection;
}