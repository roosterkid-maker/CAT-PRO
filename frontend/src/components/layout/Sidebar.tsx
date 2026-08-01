import type { ReactNode } from "react";

import type { AppPage } from "@/app/AppRouter";
import {
  Activity,
  Bell,
  FlaskConical,
  Landmark,
  LayoutDashboard,
  LineChart,
  Settings,
  Zap,
} from "lucide-react";

interface SidebarProps {
  currentPage?: AppPage;
  onPageChange?: (page: AppPage) => void;
}

interface SidebarItem {
  label: string;
  page?: AppPage;
  icon: ReactNode;
}

const items: SidebarItem[] = [
  {
    label: "Dashboard",
    page: "dashboard",
    icon: <LayoutDashboard size={18} />,
  },
  {
    label: "Markets",
    icon: <LineChart size={18} />,
  },
  {
    label: "Exchanges",
    icon: <Landmark size={18} />,
  },
  {
    label: "Arbitrage",
    page: "arbitrage",
    icon: <Zap size={18} />,
  },
  {
    label: "Paper Trading",
    page: "paper-trading",
    icon: <FlaskConical size={18} />,
  },
  {
    label: "System Health",
    page: "system-health",
    icon: <Activity size={18} />,
  },
  {
    label: "Alerts",
    icon: <Bell size={18} />,
  },
  {
    label: "Settings",
    icon: <Settings size={18} />,
  },
];

export default function Sidebar({
  currentPage = "dashboard",
  onPageChange,
}: SidebarProps) {
  return (
    <aside className="w-55 shrink-0 bg-panel py-5 text-text-primary">
      <nav className="space-y-1 px-2">
        {items.map((item) => {
          const isActive =
            item.page !== undefined &&
            currentPage === item.page;

          const isAvailable = item.page !== undefined;

          return (
            <button
              key={item.label}
              type="button"
              disabled={!isAvailable}
              onClick={() => {
                if (item.page) {
                  onPageChange?.(item.page);
                }
              }}
              className={`block w-full rounded-md px-4 py-3 text-left text-sm transition-colors ${
                isActive
                  ? "bg-panel-light font-medium text-text-primary"
                  : isAvailable
                    ? "text-text-muted hover:bg-panel-light hover:text-text-primary"
                    : "cursor-not-allowed text-text-muted opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                {item.icon}
                <span>{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}