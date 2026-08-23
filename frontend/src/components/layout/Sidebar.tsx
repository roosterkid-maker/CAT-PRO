import type {
  ReactNode,
} from "react";

import type {
  AppPage,
} from "@/app/routes";

import {
  preloadAppPage,
} from "@/app/routes";

import {
  Activity,
  BarChart3,
  Bell,
  BrainCircuit,
  Bot,
  ChevronDown,
  FlaskConical,
  Gauge,
  HardDriveDownload,
  Landmark,
  LayoutDashboard,
  LineChart,
  MoreHorizontal,
  Network,
  Settings,
  ShieldCheck,
  TestTubeDiagonal,
  Workflow,
  Zap,
} from "lucide-react";

interface SidebarProps {
  currentPage?:
    AppPage;

  onPageChange?: (
    page:
      AppPage,
  ) => void;
}

interface SidebarItem {
  label:
    string;

  page?:
    AppPage;

  icon:
    ReactNode;

}

const primaryItems:
SidebarItem[] = [
  {
    label:
      "BOT",

    page:
      "bot",

    icon:
      <Bot size={18} />,
  },

  {
    label:
      "Trade Intelligence",

    page:
      "trade-intelligence",

    icon:
      <Network size={18} />,
  },

  {
    label:
      "Markets",

    page:
      "markets",

    icon:
      <LineChart size={18} />,
  },

  {
    label:
      "Exchange Health",

    page:
      "exchange-health",

    icon:
      <Landmark size={18} />,
  },

  {
    label:
      "Settings",

    page:
      "settings",

    icon:
      <Settings size={18} />,
  },
];

const advancedItems:
SidebarItem[] = [
  {label: "Dashboard", page: "dashboard", icon: <LayoutDashboard size={18} />},
  {label: "Paper Trading Details", page: "paper-trading", icon: <FlaskConical size={18} />},
  {label: "Agent Sakhondra", page: "agent-sakhondra", icon: <BrainCircuit size={18} />},
  {label: "Alerts", page: "alerts", icon: <Bell size={18} />},
  {label: "Execution", page: "execution-monitoring", icon: <Gauge size={18} />},
  {label: "Arbitrage", page: "arbitrage", icon: <Zap size={18} />},
  {label: "Strategies", page: "strategies", icon: <Workflow size={18} />},
  {label: "Automation Center", page: "automation-center", icon: <Bot size={18} />},
  {label: "Performance", page: "performance", icon: <BarChart3 size={18} />},
  {label: "System Health", page: "system-health", icon: <Activity size={18} />},
  {label: "Production Safety", page: "production-safety", icon: <ShieldCheck size={18} />},
  {label: "Recovery", page: "recovery", icon: <HardDriveDownload size={18} />},
  {label: "Tiny-LIVE Preflight", page: "tiny-live", icon: <TestTubeDiagonal size={18} />},
];

export default function Sidebar({
  currentPage =
    "dashboard",

  onPageChange,
}: SidebarProps) {
  const advancedActive = advancedItems.some(
    (item) => item.page === currentPage,
  );

  return (
    <aside aria-label="Primary navigation" className="cat-pro-sidebar min-h-0 w-55 shrink-0 overflow-y-auto overscroll-contain py-5 text-text-primary [scrollbar-gutter:stable]">
      <div className="mb-3 flex items-center gap-2 px-6">
        <span className="size-1.5 rounded-full bg-brand shadow-[0_0_9px_var(--brand)]" />
        <span className="cat-pro-sidebar-label">Command matrix</span>
      </div>
      <nav className="space-y-1 px-2 pb-2">
        {primaryItems.map(
          (
            item,
          ) => (
            <SidebarButton
              key={item.label}
              item={item}
              active={item.page === currentPage}
              onPageChange={onPageChange}
            />
          ),
        )}

        <details
          key={`advanced-${currentPage}`}
          className="cat-pro-advanced-nav group/advanced"
          open={advancedActive || undefined}
        >
          <summary
            className="cat-pro-nav-item cat-pro-advanced-summary block w-full cursor-pointer list-none rounded-lg px-4 py-3 text-left text-sm text-text-muted transition-colors hover:text-text-primary [&::-webkit-details-marker]:hidden"
            data-active={advancedActive}
          >
            <div className="flex items-center gap-3">
              <MoreHorizontal size={18} />
              <span className="flex-1">Advanced</span>
              <ChevronDown className="cat-pro-advanced-chevron size-4 transition-transform group-open/advanced:rotate-180" />
            </div>
          </summary>

          <div className="cat-pro-advanced-menu mt-1 space-y-1 rounded-lg border border-border-default/70 bg-app-bg/35 p-1">
            {advancedItems.map((item) => (
              <SidebarButton
                key={item.label}
                item={item}
                active={item.page === currentPage}
                onPageChange={onPageChange}
                nested
              />
            ))}
          </div>
        </details>
      </nav>
    </aside>
  );
}

function SidebarButton({
  item,
  active,
  onPageChange,
  nested = false,
}: {
  item: SidebarItem;
  active: boolean;
  onPageChange?: (page: AppPage) => void;
  nested?: boolean;
}) {
  const available = item.page !== undefined;

  return (
    <button
      type="button"
      disabled={!available}
      aria-current={active ? "page" : undefined}
      data-active={active}
      onClick={() => {
        if (item.page) onPageChange?.(item.page);
      }}
      onFocus={() => {
        if (item.page) preloadAppPage(item.page);
      }}
      onPointerEnter={() => {
        if (item.page) preloadAppPage(item.page);
      }}
      className={`cat-pro-nav-item block w-full rounded-lg px-4 py-3 text-left text-sm transition-colors ${nested ? "cat-pro-nav-item-nested" : ""} ${
        active
          ? "font-semibold text-text-primary"
          : available
            ? "text-text-muted hover:text-text-primary"
            : "cursor-not-allowed text-text-muted opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        {item.icon}
        <span>{item.label}</span>
      </div>
    </button>
  );
}
