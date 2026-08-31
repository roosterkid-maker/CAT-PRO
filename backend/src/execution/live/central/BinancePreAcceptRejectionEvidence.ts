export interface BinancePreAcceptRejectionEvidence {
  readonly httpStatus: number;
  readonly exchangeCode: string;
}

/**
 * Parses only deterministic Binance order-endpoint HTTP 4xx rejections. These
 * responses prove the venue rejected the request before assigning an order ID;
 * network failures, 5xx responses and unrelated local validation errors remain
 * deliberately unclassified.
 */
export function parseBinancePreAcceptRejection(
  failureReason: string | null,
): BinancePreAcceptRejectionEvidence | null {
  if (!failureReason) {
    return null;
  }

  const match =
    /^Binance POST \/api\/v3\/order failed: status=(\d{3}), code=(-?\d+), message=.+$/u
      .exec(
        failureReason.trim(),
      );

  if (!match) {
    return null;
  }

  const httpStatus =
    Number(
      match[1],
    );

  if (
    ![
      400,
      401,
      403,
      409,
      418,
      429,
    ].includes(
      httpStatus,
    )
  ) {
    return null;
  }

  return Object.freeze({
    httpStatus,
    exchangeCode:
      match[2] as string,
  });
}
