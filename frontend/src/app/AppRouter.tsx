import Arbitrage from "@/pages/Arbitrage";
import Dashboard from "@/pages/Dashboard";
import PaperTrading from "@/pages/PaperTrading";
import SystemHealth from "@/pages/SystemHealth";

export type AppPage =
  | "dashboard"
  | "arbitrage"
  | "paper-trading"
  | "system-health";

interface AppRouterProps {
  page: AppPage;
}

export default function AppRouter({
  page,
}: AppRouterProps) {
  switch (page) {
    case "arbitrage":
      return <Arbitrage />;

    case "paper-trading":
      return <PaperTrading />;

    case "system-health":
      return <SystemHealth />;

    case "dashboard":
    default:
      return <Dashboard />;
  }
}