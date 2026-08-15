import {
  Bell,
} from "lucide-react";

import {
  RecentExecutionErrors,
} from "@/modules/execution-monitoring/components/RecentExecutionErrors";

import {
  NotificationSettingsCard,
} from "@/modules/notifications/components/NotificationSettingsCard";

import ProductionAlertCenter from "@/modules/production-alerts/components/ProductionAlertCenter";

export default function Alerts() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
            <Bell
              size={21}
            />
          </div>

          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              Production Alerts
            </h1>

            <p className="mt-1 text-sm text-text-muted">
              Persistent V18
              alert lifecycle,
              operator
              acknowledgement,
              guarded resolution,
              and execution
              diagnostics.
            </p>
          </div>
        </div>
      </header>

      <ProductionAlertCenter />

      <section>
        <NotificationSettingsCard />
      </section>

      <section>
        <RecentExecutionErrors />
      </section>
    </div>
  );
}