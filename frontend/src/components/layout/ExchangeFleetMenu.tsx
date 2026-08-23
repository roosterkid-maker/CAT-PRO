import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Server } from "lucide-react";

import { useExchangeClockSafety } from "@/modules/exchange-health/hooks/useExchangeClockSafety";
import { useExchangeFleetCapabilities } from "@/modules/exchange-health/hooks/useExchangeFleetCapabilities";
import type { ExchangeClockState } from "@/modules/exchange-health/types/ExchangeClock";
import type { ExchangeFleetCapability } from "@/modules/exchange-health/types/ExchangeFleet";

interface ExchangeFleetMenuProps {
  onOpenExchangeHealth: () => void;
  connectedMarketDataCount: number;
  totalExchangeCount: number;
  marketDataLoading: boolean;
  marketDataUnavailable: boolean;
}

export default function ExchangeFleetMenu({
  onOpenExchangeHealth,
  connectedMarketDataCount,
  totalExchangeCount,
  marketDataLoading,
  marketDataUnavailable,
}: ExchangeFleetMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState({
    left: 16,
    top: 72,
    width: 576,
  });
  const fleetQuery = useExchangeFleetCapabilities(open);
  const clockQuery = useExchangeClockSafety(open);
  const fleet = fleetQuery.data?.data;

  const clockByExchange = useMemo(
    () =>
      new Map(
        (clockQuery.data?.data.exchanges ?? []).map((clock) => [
          clock.exchange.trim().toLowerCase(),
          clock,
        ]),
      ),
    [clockQuery.data?.data.exchanges],
  );

  const fleetUnavailable = fleetQuery.isError;
  const fleetLoading = fleetQuery.isLoading && !fleet;
  const displayedExchanges = fleet
    ? [
        ...(fleet.exchanges ?? []),
        ...(fleet.observationExchanges ?? []),
      ]
    : [];
  const verifiedReadAccess = displayedExchanges.filter(
    (exchange) =>
      exchange.authenticatedRead.verificationState === "VERIFIED" &&
      exchange.authenticatedRead.fresh,
  ).length;

  const handleOpenHealth = () => {
    setOpen(false);
    onOpenExchangeHealth();
  };

  const updatePopupPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const viewportMargin = 16;
    const triggerRect = trigger.getBoundingClientRect();
    const width = Math.min(576, window.innerWidth - viewportMargin * 2);
    const left = Math.min(
      Math.max(viewportMargin, triggerRect.right - width),
      Math.max(viewportMargin, window.innerWidth - width - viewportMargin),
    );

    setPopupPosition({
      left,
      top: triggerRect.bottom + 8,
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePopupPosition();
    window.addEventListener("resize", updatePopupPosition);
    document.addEventListener("scroll", updatePopupPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      document.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [open, updatePopupPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        !triggerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-default bg-app-bg/70 px-3 py-2 text-left transition-colors hover:border-brand/50 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <Server className="h-4 w-4 text-brand" />

        <span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Exchanges
          </span>

          <span className="block text-xs font-semibold text-text-primary">
            {marketDataLoading
              ? "Checking"
              : marketDataUnavailable
                ? "Unavailable"
                : `${connectedMarketDataCount}/${totalExchangeCount || 5} market data`}
          </span>
        </span>

        <ChevronDown
          className={`h-4 w-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="Six-exchange PAPER fleet"
            className="fixed overflow-hidden rounded-xl border border-border-default bg-panel shadow-2xl shadow-black/40"
            style={{
              left: popupPosition.left,
              top: popupPosition.top,
              width: popupPosition.width,
              zIndex: 2_147_483_000,
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border-default bg-app-bg/70 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Six-exchange PAPER fleet
                </p>

                <p className="mt-1 text-xs text-text-muted">
                  Unified market-data, PAPER eligibility and authenticated-read evidence.
                </p>
              </div>

              <span className="whitespace-nowrap rounded-full border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-danger">
                LIVE OFF
              </span>
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {fleetLoading ? (
                <MenuMessage message="Loading exchange evidence..." />
              ) : fleetUnavailable || !fleet ? (
                <MenuMessage message="Fleet API unavailable. No exchange status has been inferred." />
              ) : (
                displayedExchanges.map((exchange) => (
                  <ExchangeRow
                    key={exchange.exchange}
                    exchange={exchange}
                    clock={clockByExchange.get(exchange.exchange)}
                    clockUnavailable={clockQuery.isError}
                    showPaperEligibility={exchange.exchange === "zebpay"}
                    paperEligible={
                      exchange.exchange === "zebpay" &&
                      (fleet.observationSummary?.executionEligible ?? 0) > 0
                    }
                  />
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border-default bg-app-bg/50 px-4 py-3">
              <p className="text-[11px] text-text-muted">
                {fleet
                  ? `Authenticated read verified ${verifiedReadAccess}/${displayedExchanges.length}`
                  : "Waiting for verified fleet evidence"}
              </p>

              <button
                type="button"
                onClick={handleOpenHealth}
                className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Open Exchange Health
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

interface ExchangeRowProps {
  exchange: ExchangeFleetCapability;
  clock: ExchangeClockState | undefined;
  clockUnavailable: boolean;
  showPaperEligibility?: boolean;
  paperEligible?: boolean;
}

function ExchangeRow({
  exchange,
  clock,
  clockUnavailable,
  showPaperEligibility = false,
  paperEligible = false,
}: ExchangeRowProps) {
  const auth = getAuthenticationStatus(exchange);
  const clockStatus = getClockStatus(clock, clockUnavailable);

  return (
    <div className="grid grid-cols-[minmax(7rem,1fr)_auto] gap-3 border-b border-border-default/70 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(7rem,1fr)_auto_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text-primary">
          {exchange.displayName}
        </p>

        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-text-muted">
          {exchange.marketData.implementationState === "IMPLEMENTED"
            ? "Market data implemented"
            : "Market data not implemented"}
        </p>
      </div>

      <StatusPill
        label={exchange.marketData.connected ? "Data connected" : "Data offline"}
        tone={exchange.marketData.connected ? "success" : "danger"}
      />

      <StatusPill
        label={
          showPaperEligibility
            ? paperEligible
              ? "PAPER eligible"
              : "PAPER blocked"
            : auth.label
        }
        tone={
          showPaperEligibility
            ? paperEligible
              ? "success"
              : "warning"
            : auth.tone
        }
      />
      <StatusPill
        label={showPaperEligibility ? auth.label : clockStatus.label}
        tone={showPaperEligibility ? auth.tone : clockStatus.tone}
      />
    </div>
  );
}

interface StatusPillProps {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}

function StatusPill({ label, tone }: StatusPillProps) {
  const styles: Record<StatusPillProps["tone"], string> = {
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
    neutral: "border-border-default bg-app-bg text-text-muted",
  };

  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold ${styles[tone]}`}
    >
      <span
        aria-hidden="true"
        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle"
      />
      {label}
    </span>
  );
}

function MenuMessage({ message }: { message: string }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-text-muted">
      {message}
    </p>
  );
}

function getAuthenticationStatus(
  exchange: ExchangeFleetCapability,
): Pick<StatusPillProps, "label" | "tone"> {
  switch (exchange.authenticatedRead.verificationState) {
    case "VERIFIED":
      return { label: "Auth verified", tone: "success" };
    case "CONFIGURED_UNVERIFIED":
      return { label: "Auth unverified", tone: "warning" };
    case "VERIFICATION_STALE":
      return { label: "Auth stale", tone: "warning" };
    case "NOT_CONFIGURED":
      return { label: "Auth not set", tone: "neutral" };
  }
}

function getClockStatus(
  clock: ExchangeClockState | undefined,
  clockUnavailable: boolean,
): Pick<StatusPillProps, "label" | "tone"> {
  if (clockUnavailable) {
    return { label: "Clock unavailable", tone: "neutral" };
  }

  if (!clock) {
    return { label: "Clock checking", tone: "neutral" };
  }

  if (clock.mode === "NOT_REQUIRED") {
    return clock.signedRequestAllowed
      ? { label: "Clock safe · N/A", tone: "success" }
      : { label: "Clock blocked", tone: "danger" };
  }

  if (clock.mode === "LOCAL_CLOCK_ONLY" && clock.signedRequestAllowed) {
    return { label: "Clock safe · local", tone: "success" };
  }

  if (clock.health === "HEALTHY" && clock.signedRequestAllowed) {
    return { label: "Clock safe", tone: "success" };
  }

  return { label: "Clock blocked", tone: "danger" };
}
