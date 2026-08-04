import { DashboardLayout } from "@/shared/layouts/DashboardLayout";

import { AnalyticsCards } from "@/features/dashboard/components/AnalyticsCards";
import { OpportunityTable } from "@/features/dashboard/components/OpportunityTable";
import { PortfolioSummary } from "@/features/dashboard/components/PortfolioSummary";
import { ExchangeStatus } from "@/features/dashboard/components/ExchangeStatus";
import { ActivityFeed } from "@/features/dashboard/components/ActivityFeed";

export function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">

        <AnalyticsCards />

        <OpportunityTable />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <PortfolioSummary />

          <ExchangeStatus />
        </div>

        <ActivityFeed />

      </div>
    </DashboardLayout>
  );
}