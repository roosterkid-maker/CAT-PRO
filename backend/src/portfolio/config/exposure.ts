export interface ExposureLimits {
  maximumTotalOpenCapitalPercent: number;
  maximumSinglePositionPercent: number;
  maximumExchangeExposurePercent: number;
  maximumMarketExposurePercent: number;
  warningThresholdPercentOfLimit: number;
}

export const exposureLimits: ExposureLimits = {
  maximumTotalOpenCapitalPercent: 70,
  maximumSinglePositionPercent: 20,
  maximumExchangeExposurePercent: 50,
  maximumMarketExposurePercent: 30,
  warningThresholdPercentOfLimit: 80,
};