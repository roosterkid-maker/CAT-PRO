export interface DepthAnalysis {
  requestedQuantity: number;

  executableQuantity: number;

  executableCapital: number;

  averagePrice: number;

  remainingQuantity: number;

  fillPercent: number;

  fullyExecutable: boolean;

  consumedLevels: number;
}