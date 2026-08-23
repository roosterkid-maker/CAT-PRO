import assert from "node:assert/strict";

import {
  CoinDCXExecutionAdapter,
} from "../adapters/CoinDCXExecutionAdapter";

async function main(): Promise<void> {
  const previousKey =
    process.env.COINDCX_API_KEY;
  const previousSecret =
    process.env.COINDCX_API_SECRET;
  delete process.env.COINDCX_API_KEY;
  delete process.env.COINDCX_API_SECRET;

  try {
    const adapter =
      new CoinDCXExecutionAdapter();
    const unsupported =
      await adapter.execute({
        exchange:
          "coindcx",
        product:
          "SPOT",
        market:
          "COTIUSDT",
        side:
          "buy",
        orderType:
          "limit",
        timeInForce:
          "FOK",
        quantity:
          1,
        price:
          0.1,
        clientOrderId:
          "cat-invalid-fok",
        timeoutMs:
          1_000,
        pollingIntervalMs:
          100,
        cancelOnTimeout:
          true,
      });

    assert.equal(
      unsupported.status,
      "FAILED",
    );
    assert.match(
      unsupported.failureReason ??
        "",
      /only the audited GTC/i,
    );
    assert.doesNotMatch(
      unsupported.failureReason ??
        "",
      /environment variable is missing/i,
      "Unsupported FOK must fail before credential access or signed exchange I/O.",
    );

    const unbounded =
      await adapter.execute({
        exchange:
          "coindcx",
        product:
          "SPOT",
        market:
          "COTIUSDT",
        side:
          "buy",
        orderType:
          "limit",
        timeInForce:
          "GTC",
        quantity:
          1,
        price:
          0.1,
        clientOrderId:
          "cat-unbounded-gtc",
        timeoutMs:
          10_001,
        pollingIntervalMs:
          100,
        cancelOnTimeout:
          true,
      });

    assert.equal(
      unbounded.status,
      "FAILED",
    );
    assert.match(
      unbounded.failureReason ??
        "",
      /bounded timeout/i,
    );
    assert.doesNotMatch(
      unbounded.failureReason ??
        "",
      /environment variable is missing/i,
      "Unbounded GTC must fail before credential access or signed exchange I/O.",
    );
  } finally {
    restoreEnvironment(
      "COINDCX_API_KEY",
      previousKey,
    );
    restoreEnvironment(
      "COINDCX_API_SECRET",
      previousSecret,
    );
  }

  console.log(
    "COINDCX GTC EXECUTION CONTRACT TEST PASSED.",
  );
  console.log(
    "FOK fallback and unbounded GTC were rejected before credential access; no exchange order occurred.",
  );
}

function restoreEnvironment(
  name: string,
  value: string | undefined,
): void {
  if (
    value ===
    undefined
  ) {
    delete process.env[name];
  } else {
    process.env[name] =
      value;
  }
}

void main().catch(
  (error: unknown) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
