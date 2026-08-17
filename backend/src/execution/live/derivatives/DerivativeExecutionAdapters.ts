import {binanceCredentialsProvider} from "../../../exchanges/binance/api/BinanceCredentialsProvider";
import {bybitCredentialsProvider} from "../../../exchanges/bybit/api/BybitCredentialsProvider";
import {BinanceUsdMOrderApi, binanceUsdMOrderApi} from "./BinanceUsdMOrderApi";
import {BybitLinearOrderApi, bybitLinearOrderApi} from "./BybitLinearOrderApi";
import {DerivativeLiveExecutionAdapter} from "./DerivativeOrderContract";

export const binanceUsdMExecutionAdapter = new DerivativeLiveExecutionAdapter(
  binanceUsdMOrderApi as BinanceUsdMOrderApi,
  binanceCredentialsProvider,
);

export const bybitLinearExecutionAdapter = new DerivativeLiveExecutionAdapter(
  bybitLinearOrderApi as BybitLinearOrderApi,
  bybitCredentialsProvider,
);
