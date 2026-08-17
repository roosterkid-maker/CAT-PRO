import { useEffect } from "react";

import { PaperTradeDetails } from "./PaperTradeDetails";
import { PaperTradeStatusBadge } from "./PaperTradeStatusBadge";

import type { PaperTrade } from "../types/PaperTrade";

interface PaperTradeDrawerProps {
  trade: PaperTrade | null;
  open: boolean;
  onClose: () => void;
}

export function PaperTradeDrawer({
  trade,
  open,
  onClose,
}: PaperTradeDrawerProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open, onClose]);

  if (!open || trade === null) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-trade-drawer-title"
    >
      <button
        type="button"
        aria-label="Close trade details"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-border-default bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b border-border-default px-6 py-5">
          <div>
            <p className="text-sm text-text-muted">
              Paper Trade
            </p>

            <h2
              id="paper-trade-drawer-title"
              className="mt-1 text-xl font-semibold"
            >
              {trade.market}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <PaperTradeStatusBadge
              status={trade.status}
            />

            <button
              type="button"
              onClick={onClose}
              aria-label="Close trade details"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-panel text-xl text-text-muted transition-colors hover:bg-panel-light hover:text-text-primary"
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <PaperTradeDetails trade={trade} />
        </div>
      </aside>
    </div>
  );
}