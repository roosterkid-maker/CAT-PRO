import fs from "node:fs";
import path from "node:path";

import { vwapCalculator } from "../../src/orderbook/calculators/VWAPCalculator";

interface BenchmarkLevel {
  price: number;
  quantity: number;
}

interface BenchmarkExpected {
  filledQuantity: number;
  averagePrice?: number;
  partialFill: boolean;
  fillPercent?: number;
}

interface BenchmarkFile {
  name: string;
  levels: BenchmarkLevel[];
  requestedQuantity: number;
  expected: BenchmarkExpected;
}

const EPSILON = 1e-9;

function approximatelyEqual(
  actual: number,
  expected: number,
): boolean {
  return Math.abs(actual - expected) <= EPSILON;
}

function loadBenchmark(
  filename: string,
): BenchmarkFile {
  const fullPath = path.join(
    __dirname,
    "..",
    "benchmarks",
    filename,
  );

  return JSON.parse(
    fs.readFileSync(fullPath, "utf8"),
  ) as BenchmarkFile;
}

function runBenchmark(
  filename: string,
): void {
  const benchmark =
    loadBenchmark(filename);

  const result =
    vwapCalculator.calculate(
      benchmark.levels,
      benchmark.requestedQuantity,
    );

  const failures: string[] = [];

  if (
    !approximatelyEqual(
      result.filledQuantity,
      benchmark.expected.filledQuantity,
    )
  ) {
    failures.push(
      `filledQuantity expected ${benchmark.expected.filledQuantity}, received ${result.filledQuantity}`,
    );
  }

  if (
    result.partialFill !==
    benchmark.expected.partialFill
  ) {
    failures.push(
      `partialFill expected ${benchmark.expected.partialFill}, received ${result.partialFill}`,
    );
  }

  if (
    benchmark.expected.averagePrice !==
      undefined &&
    !approximatelyEqual(
      result.averagePrice,
      benchmark.expected.averagePrice,
    )
  ) {
    failures.push(
      `averagePrice expected ${benchmark.expected.averagePrice}, received ${result.averagePrice}`,
    );
  }

  if (
    benchmark.expected.fillPercent !==
      undefined &&
    !approximatelyEqual(
      result.fillPercent,
      benchmark.expected.fillPercent,
    )
  ) {
    failures.push(
      `fillPercent expected ${benchmark.expected.fillPercent}, received ${result.fillPercent}`,
    );
  }

  console.log(
    "================================",
  );

  if (failures.length === 0) {
    console.log(`PASS: ${benchmark.name}`);
    return;
  }

  console.error(`FAIL: ${benchmark.name}`);

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exitCode = 1;
}

runBenchmark("vwap-small.json");
runBenchmark("vwap-partial.json");