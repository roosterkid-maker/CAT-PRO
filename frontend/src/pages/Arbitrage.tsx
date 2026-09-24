import {
  InrScannerPanel,
} from "@/modules/live-only/components/InrScannerPanel";

/*
 * The arbitrage scanner is the only opportunity view: USDT<->USDT,
 * INR<->INR and USDT<->INR across CoinDCX, UnoCoin, CoinSwitch, Binance and
 * Bybit, valid and executable routes only. The legacy opportunity-engine
 * board that used to live here was retired with the old USDT-only system.
 */
export default function Arbitrage() {
  return (
    <section className="space-y-6">
      <InrScannerPanel />
    </section>
  );
}
