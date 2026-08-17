import {
  useExecutionHealth,
} from "../hooks/useExecutionMonitoring";

export function ExecutionHealthCard() {
  const {
    data,
    isLoading,
    error,
  } =
    useExecutionHealth();

  if (isLoading) {
    return (
      <div>
        Loading execution health...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        Unable to load execution health.
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="text-lg font-semibold">
        Execution Health
      </div>

      <div className="mt-4 space-y-2">

        <div>
          Overall Status:
          {" "}
          <strong>
            {data.status}
          </strong>
        </div>

        <div>
          Total Executions:
          {" "}
          {data.totalExecutions}
        </div>

        <div>
          Healthy Exchanges:
          {" "}
          {data.healthyExchanges}
        </div>

        <div>
          Degraded Exchanges:
          {" "}
          {data.degradedExchanges}
        </div>

        <div>
          Unhealthy Exchanges:
          {" "}
          {data.unhealthyExchanges}
        </div>

      </div>
    </div>
  );
}