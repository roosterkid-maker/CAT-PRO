import type {
  ReactNode,
} from "react";

import type {
  AppPage,
} from "@/app/AppRouter";

import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  FlaskConical,
  Gauge,
  HardDriveDownload,
  Landmark,
  LayoutDashboard,
  LineChart,
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

const items:
SidebarItem[] = [
  {
    label:
      "Dashboard",

    page:
      "dashboard",

    icon:
      <LayoutDashboard size={18} />,
  },

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
      "Trade Flow",

    page:
      "trade-flow",

    icon:
      <Network size={18} />,
  },

  {
    label:
      "Execution",

    page:
      "execution-monitoring",

    icon:
      <Gauge size={18} />,
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
      "Arbitrage",

    page:
      "arbitrage",

    icon:
      <Zap size={18} />,
  },

  {
    label:
      "Paper Trading",

    page:
      "paper-trading",

    icon:
      <FlaskConical size={18} />,
  },

  {
    label:
      "Strategies",

    page:
      "strategies",

    icon:
      <Workflow size={18} />,
  },

  {
    label:
      "Automation Center",

    page:
      "automation-center",

    icon:
      <Bot size={18} />,
  },

  {
    label:
      "Performance",

    page:
      "performance",

    icon:
      <BarChart3 size={18} />,
  },

  {
    label:
      "System Health",

    page:
      "system-health",

    icon:
      <Activity size={18} />,
  },

  {
    label:
      "Production Safety",

    page:
      "production-safety",

    icon:
      <ShieldCheck size={18} />,
  },

  {
    label:
      "Recovery",

    page:
      "recovery",

    icon:
      <HardDriveDownload size={18} />,
  },

  {
    label:
      "Tiny-LIVE Preflight",

    page:
      "tiny-live",

    icon:
      <TestTubeDiagonal size={18} />,
  },

  {
    label:
      "Alerts",

    page:
      "alerts",

    icon:
      <Bell size={18} />,
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

export default function Sidebar({
  currentPage =
    "dashboard",

  onPageChange,
}: SidebarProps) {
  return (
    <aside aria-label="Primary navigation" className="cat-pro-sidebar min-h-0 w-55 shrink-0 overflow-y-auto overscroll-contain py-5 text-text-primary [scrollbar-gutter:stable]">
      <div className="mb-3 flex items-center gap-2 px-6">
        <span className="size-1.5 rounded-full bg-brand shadow-[0_0_9px_var(--brand)]" />
        <span className="cat-pro-sidebar-label">Command matrix</span>
      </div>
      <nav className="space-y-1 px-2 pb-2">
        {items.map(
          (
            item,
          ) => {
            const isActive =
              item.page !==
                undefined &&
              currentPage ===
                item.page;

            const isAvailable =
              item.page !==
              undefined;

            return (
              <button
                key={
                  item.label
                }
                type="button"
                disabled={
                  !isAvailable
                }
                aria-current={isActive ? "page" : undefined}
                data-active={isActive}
                onClick={() => {
                  if (
                    item.page
                  ) {
                    onPageChange?.(
                      item.page,
                    );
                  }
                }}
                className={`cat-pro-nav-item block w-full rounded-lg px-4 py-3 text-left text-sm transition-colors ${
                  isActive
                    ? "font-semibold text-text-primary"
                    : isAvailable
                      ? "text-text-muted hover:text-text-primary"
                      : "cursor-not-allowed text-text-muted opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  {
                    item.icon
                  }

                  <span>
                    {
                      item.label
                    }
                  </span>
                </div>
              </button>
            );
          },
        )}
      </nav>
    </aside>
  );
}
