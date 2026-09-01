import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  AdaptivePaperCapitalAllocatorService,
} from "../../../automation/services/AdaptivePaperCapitalAllocatorService";
import {
  MultiOpportunityPaperSchedulerService,
} from "../../../automation/services/MultiOpportunityPaperSchedulerService";
import {
  AutomatedPaperExecutionControllerService,
} from "../../../automation/services/AutomatedPaperExecutionControllerService";
import {
  PAPER_CAPITAL_UPDATE_CONFIRMATION,
  PaperCapitalConfigurationService,
} from "../PaperCapitalConfigurationService";

const temporaryDirectory =
  mkdtempSync(
    join(
      tmpdir(),
      "cat-pro-paper-capital-",
    ),
  );

const persistenceFile =
  join(
    temporaryDirectory,
    "configuration.jsonl",
  );

try {
  const service =
    new PaperCapitalConfigurationService(
      persistenceFile,
      1_000,
    );

  const defaults =
    service.getConfiguration();

  assert.equal(
    defaults.capitalBudgetInr,
    100_000,
  );
  assert.equal(
    defaults.minimumCapitalPerTrade,
    100,
  );
  assert.equal(
    defaults.maximumCapitalPerTrade,
    1_000,
  );
  assert.equal(
    defaults.capitalStep,
    100,
  );
  assert.equal(
    defaults.maximumExecutionsPerBatch,
    3,
  );
  assert.equal(
    defaults.maximumBatchCapital,
    3_000,
  );
  assert.equal(
    defaults.revision,
    0,
  );
  assert.equal(
    defaults.liveExecutionAllowed,
    false,
  );
  assert.equal(
    defaults.orderSubmissionAllowed,
    false,
  );

  assert.throws(
    () =>
      service.updateConfiguration(
        {
          capitalBudgetInr:
            50_000,
          minimumCapitalPerTrade:
            200,
          maximumCapitalPerTrade:
            1_500,
          capitalStep:
            100,
          maximumExecutionsPerBatch:
            2,
          maximumBatchCapital:
            3_000,
        },
        "WRONG_CONFIRMATION",
        2_000,
      ),
    /requires confirmation/,
  );

  assert.throws(
    () =>
      service.updateConfiguration(
        {
          capitalBudgetInr:
            50_000,
          minimumCapitalPerTrade:
            100,
          maximumCapitalPerTrade:
            1_001,
          capitalStep:
            100,
          maximumExecutionsPerBatch:
            2,
          maximumBatchCapital:
            2_000,
        },
        PAPER_CAPITAL_UPDATE_CONFIRMATION,
        2_000,
      ),
    /cannot exceed ₹1,000/,
  );

  assert.throws(
    () =>
      new AutomatedPaperExecutionControllerService({
        maximumCapitalPerTrade:
          1_001,
      }),
    /cannot exceed 1000/,
  );

  assert.throws(
    () =>
      new MultiOpportunityPaperSchedulerService({
        minimumCapitalPerTrade:
          99,
      }),
    /cannot be below 100/,
  );

  assert.throws(
    () =>
      service.updateConfiguration(
        {
          capitalBudgetInr:
            800,
          minimumCapitalPerTrade:
            100,
          maximumCapitalPerTrade:
            900,
          capitalStep:
            100,
          maximumExecutionsPerBatch:
            2,
          maximumBatchCapital:
            900,
        },
        PAPER_CAPITAL_UPDATE_CONFIRMATION,
        2_000,
      ),
    /cannot exceed the deployable capital budget/,
  );

  const updated =
    service.updateConfiguration(
      {
        capitalBudgetInr:
          50_000,
        minimumCapitalPerTrade:
          200,
        maximumCapitalPerTrade:
          1_000,
        capitalStep:
          100,
        maximumExecutionsPerBatch:
          2,
        maximumBatchCapital:
          2_000,
      },
      PAPER_CAPITAL_UPDATE_CONFIRMATION,
      3_000,
    );

  assert.equal(
    updated.revision,
    1,
  );
  assert.equal(
    updated.source,
    "DASHBOARD",
  );

  const restored =
    new PaperCapitalConfigurationService(
      persistenceFile,
      4_000,
    ).getConfiguration();

  assert.deepEqual(
    restored,
    updated,
  );

  const allocator =
    new AdaptivePaperCapitalAllocatorService(
      {},
      () => ({
        totalCapitalBudget:
          service.getConfiguration().capitalBudgetInr,
        minimumCapital:
          service.getConfiguration().minimumCapitalPerTrade,
        maximumCapitalPerTrade:
          service.getConfiguration().maximumCapitalPerTrade,
        capitalStep:
          service.getConfiguration().capitalStep,
      }),
    );

  const scheduler =
    new MultiOpportunityPaperSchedulerService(
      {},
      () => ({
        maximumExecutionsPerBatch:
          service.getConfiguration().maximumExecutionsPerBatch,
        minimumCapitalPerTrade:
          service.getConfiguration().minimumCapitalPerTrade,
        maximumCapitalPerTrade:
          service.getConfiguration().maximumCapitalPerTrade,
        maximumBatchCapital:
          service.getConfiguration().maximumBatchCapital,
      }),
    );

  const controller =
    new AutomatedPaperExecutionControllerService(
      {},
      () => ({
        minimumCapitalPerTrade:
          service.getConfiguration().minimumCapitalPerTrade,
        maximumCapitalPerTrade:
          service.getConfiguration().maximumCapitalPerTrade,
      }),
    );

  assert.equal(
    allocator.getDiagnostics().config.totalCapitalBudget,
    50_000,
  );
  assert.equal(
    allocator.getDiagnostics().config.minimumCapital,
    200,
  );
  assert.equal(
    scheduler.getDiagnostics().config.maximumBatchCapital,
    2_000,
  );
  assert.equal(
    controller.getDiagnostics().config.maximumCapitalPerTrade,
    1_000,
  );
  assert.equal(
    scheduler.getDiagnostics().config.minimumCapitalPerTrade,
    200,
  );
  assert.equal(
    controller.getDiagnostics().config.minimumCapitalPerTrade,
    200,
  );

  service.updateConfiguration(
    {
      capitalBudgetInr:
        25_000,
      minimumCapitalPerTrade:
        100,
      maximumCapitalPerTrade:
        500,
      capitalStep:
        100,
      maximumExecutionsPerBatch:
        2,
      maximumBatchCapital:
        1_000,
    },
    PAPER_CAPITAL_UPDATE_CONFIRMATION,
    5_000,
  );

  assert.equal(
    allocator.getDiagnostics().config.totalCapitalBudget,
    25_000,
  );
  assert.equal(
    allocator.getDiagnostics().config.maximumCapitalPerTrade,
    500,
  );
  assert.equal(
    scheduler.getDiagnostics().config.maximumCapitalPerTrade,
    500,
  );
  assert.equal(
    controller.getDiagnostics().config.maximumCapitalPerTrade,
    500,
  );

  console.log(
    "Unified PAPER capital configuration persisted and propagated to allocator, scheduler, and controller without enabling LIVE or orders.",
  );
} finally {
  rmSync(
    temporaryDirectory,
    {
      recursive:
        true,
      force:
        true,
    },
  );
}
