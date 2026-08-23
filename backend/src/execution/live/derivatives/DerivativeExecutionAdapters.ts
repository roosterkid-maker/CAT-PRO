import {binanceUsdMCredentialsProvider} from "../../../derivatives/providers/BinanceUsdMCredentialsProvider";
import {bybitCredentialsProvider} from "../../../exchanges/bybit/api/BybitCredentialsProvider";
import {BinanceUsdMOrderApi, binanceUsdMOrderApi} from "./BinanceUsdMOrderApi";
import {BybitLinearOrderApi, bybitLinearOrderApi} from "./BybitLinearOrderApi";
import {DerivativeLiveExecutionAdapter} from "./DerivativeOrderContract";

export const binanceUsdMExecutionAdapter = new DerivativeLiveExecutionAdapter(
  binanceUsdMOrderApi as BinanceUsdMOrderApi,
  binanceUsdMCredentialsProvider,
);

export const bybitLinearExecutionAdapter = new DerivativeLiveExecutionAdapter(
  bybitLinearOrderApi as BybitLinearOrderApi,
  bybitCredentialsProvider,
);
