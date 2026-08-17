import {
  useExecutionMetrics,
} from "../hooks/useExecutionMonitoring";

export function ExecutionMetricsCard() {
  const {
    data,
    isLoading,
    error,
  } =
    useExecutionMetrics();

  if (isLoading) {
    return (
      <div>
        Loading metrics...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        Unable to load metrics.
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">

      <div className="text-lg font-semibold">
        Execution Metrics
      </div>

      <div className="mt-4">

        Total Executions:
        {" "}
        {data.totalExecutions}

      </div>

      <table className="mt-4 w-full">

        <thead>

          <tr>

            <th>
              Exchange
            </th>

            <th>
              Executions
            </th>

            <th>
              Fill %
            </th>

            <th>
              Timeout %
            </th>

            <th>
              Avg ms
            </th>

          </tr>

        </thead>

        <tbody>

          {data.exchanges.map(
            (
              exchange,
            ) => (
              <tr
                key={
                  exchange.exchange
                }
              >
                <td>
                  {
                    exchange.exchange
                  }
                </td>

                <td>
                  {
                    exchange.totalExecutions
                  }
                </td>

                <td>
                  {
                    exchange.fillRatePercent
                  }
                </td>

                <td>
                  {
                    exchange.timeoutRatePercent
                  }
                </td>

                <td>
                  {
                    exchange.averageExecutionTimeMs.toFixed(
                      0,
                    )
                  }
                </td>

              </tr>
            ),
          )}

        </tbody>

      </table>

    </div>
  );
}