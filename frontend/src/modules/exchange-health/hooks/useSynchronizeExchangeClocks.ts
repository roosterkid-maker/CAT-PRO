import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  synchronizeExchangeClocks,
} from "../services/exchangeHealthApi";

export function useSynchronizeExchangeClocks() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: () =>
      synchronizeExchangeClocks(),

    onSuccess:
      async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [
              "exchange-health",
              "evidence-snapshot",
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              "exchange-health",
              "clock-safety",
            ],
          }),
        ]);
      },
  });
}
