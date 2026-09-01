import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

export const PAPER_CAPITAL_UPDATE_CONFIRMATION =
  "UPDATE_PAPER_CAPITAL_CONFIGURATION";

export const PAPER_CAPITAL_SAFETY_ENVELOPE = {
  minimumCapitalPerTrade:
    100,

  maximumCapitalPerTrade:
    1_000,
} as const;

export interface PaperCapitalConfigurationValues {
  capitalBudgetInr: number;

  minimumCapitalPerTrade: number;

  maximumCapitalPerTrade: number;

  capitalStep: number;

  maximumExecutionsPerBatch: number;

  maximumBatchCapital: number;
}

export interface PaperCapitalConfiguration
  extends PaperCapitalConfigurationValues {
  version: "86.0";

  revision: number;

  updatedAt: number;

  source:
    | "DEFAULT"
    | "DASHBOARD";

  mode: "PAPER_ONLY";

  currency: "INR";

  liveExecutionAllowed: false;

  orderSubmissionAllowed: false;
}

export const DEFAULT_PAPER_CAPITAL_CONFIGURATION:
  Readonly<PaperCapitalConfigurationValues> = {
  capitalBudgetInr:
    100_000,

  minimumCapitalPerTrade:
    100,

  maximumCapitalPerTrade:
    1_000,

  capitalStep:
    100,

  maximumExecutionsPerBatch:
    3,

  maximumBatchCapital:
    3_000,
};

const DEFAULT_CONFIGURATION_FILE =
  resolve(
    process.cwd(),
    "logs",
    "control",
    "paper-capital-configuration.jsonl",
  );

export class PaperCapitalConfigurationService {
  private readonly store:
    JsonlSnapshotStore<PaperCapitalConfiguration>;

  private configuration:
    PaperCapitalConfiguration;

  constructor(
    persistenceFilePath =
      DEFAULT_CONFIGURATION_FILE,

    now =
      Date.now(),
  ) {
    this.store =
      new JsonlSnapshotStore<PaperCapitalConfiguration>({
        filePath:
          persistenceFilePath,

        isPayload:
          isPaperCapitalConfiguration,
      });

    const restored =
      this.store
        .readAll()
        .at(-1);

    this.configuration =
      restored ??
      createConfiguration(
        DEFAULT_PAPER_CAPITAL_CONFIGURATION,
        0,
        now,
        "DEFAULT",
      );

    validateValues(
      this.configuration,
    );
  }

  getConfiguration():
    PaperCapitalConfiguration {
    return structuredClone(
      this.configuration,
    );
  }

  updateConfiguration(
    values:
      PaperCapitalConfigurationValues,

    confirmation:
      string,

    now =
      Date.now(),
  ): PaperCapitalConfiguration {
    if (
      confirmation !==
        PAPER_CAPITAL_UPDATE_CONFIRMATION
    ) {
      throw new Error(
        `PAPER capital update requires confirmation ${PAPER_CAPITAL_UPDATE_CONFIRMATION}.`,
      );
    }

    validateValues(
      values,
    );

    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "PAPER capital update timestamp must be a positive safe integer.",
      );
    }

    const next =
      createConfiguration(
        values,
        this.configuration.revision + 1,
        now,
        "DASHBOARD",
      );

    this.store.append(
      next,
    );

    this.configuration =
      next;

    return this.getConfiguration();
  }
}

function createConfiguration(
  values:
    PaperCapitalConfigurationValues,

  revision:
    number,

  updatedAt:
    number,

  source:
    PaperCapitalConfiguration["source"],
): PaperCapitalConfiguration {
  return {
    version:
      "86.0",

    revision,

    updatedAt,

    source,

    mode:
      "PAPER_ONLY",

    currency:
      "INR",

    capitalBudgetInr:
      values.capitalBudgetInr,

    minimumCapitalPerTrade:
      values.minimumCapitalPerTrade,

    maximumCapitalPerTrade:
      values.maximumCapitalPerTrade,

    capitalStep:
      values.capitalStep,

    maximumExecutionsPerBatch:
      values.maximumExecutionsPerBatch,

    maximumBatchCapital:
      values.maximumBatchCapital,

    liveExecutionAllowed:
      false,

    orderSubmissionAllowed:
      false,
  };
}

function validateValues(
  values:
    PaperCapitalConfigurationValues,
): void {
  const capitalFields:
    Array<[
      keyof PaperCapitalConfigurationValues,
      number,
    ]> = [
      [
        "capitalBudgetInr",
        values.capitalBudgetInr,
      ],
      [
        "minimumCapitalPerTrade",
        values.minimumCapitalPerTrade,
      ],
      [
        "maximumCapitalPerTrade",
        values.maximumCapitalPerTrade,
      ],
      [
        "capitalStep",
        values.capitalStep,
      ],
      [
        "maximumBatchCapital",
        values.maximumBatchCapital,
      ],
    ];

  for (
    const [
      name,
      value,
    ]
    of capitalFields
  ) {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value <=
        0
    ) {
      throw new Error(
        `${name} must be a positive whole INR amount.`,
      );
    }
  }

  if (
    values.capitalBudgetInr >
      10_000_000
  ) {
    throw new Error(
      "PAPER capital budget cannot exceed ₹1,00,00,000.",
    );
  }

  if (
    values.minimumCapitalPerTrade <
      PAPER_CAPITAL_SAFETY_ENVELOPE
        .minimumCapitalPerTrade
  ) {
    throw new Error(
      "Minimum PAPER capital per trade cannot be below ₹100.",
    );
  }

  if (
    values.maximumCapitalPerTrade >
      PAPER_CAPITAL_SAFETY_ENVELOPE
        .maximumCapitalPerTrade
  ) {
    throw new Error(
      "Maximum PAPER capital per trade cannot exceed ₹1,000.",
    );
  }

  if (
    values.maximumCapitalPerTrade <
      values.minimumCapitalPerTrade
  ) {
    throw new Error(
      "Maximum PAPER capital per trade must be at least the minimum.",
    );
  }

  if (
    values.maximumCapitalPerTrade >
      values.capitalBudgetInr
  ) {
    throw new Error(
      "Maximum PAPER capital per trade cannot exceed the deployable capital budget.",
    );
  }

  if (
    values.capitalStep >
      values.maximumCapitalPerTrade
  ) {
    throw new Error(
      "PAPER capital step cannot exceed the maximum capital per trade.",
    );
  }

  if (
    !Number.isSafeInteger(
      values.maximumExecutionsPerBatch,
    ) ||
    values.maximumExecutionsPerBatch <
      1 ||
    values.maximumExecutionsPerBatch >
      10
  ) {
    throw new Error(
      "Maximum PAPER executions per batch must be an integer between 1 and 10.",
    );
  }

  if (
    values.maximumBatchCapital <
      values.maximumCapitalPerTrade
  ) {
    throw new Error(
      "Maximum PAPER batch capital must cover at least one maximum-size trade.",
    );
  }

  if (
    values.maximumBatchCapital >
      values.capitalBudgetInr
  ) {
    throw new Error(
      "Maximum PAPER batch capital cannot exceed the deployable capital budget.",
    );
  }

  if (
    values.maximumBatchCapital >
      values.maximumCapitalPerTrade *
        values.maximumExecutionsPerBatch
  ) {
    throw new Error(
      "Maximum PAPER batch capital cannot exceed per-trade cap × executions per batch.",
    );
  }
}

function isPaperCapitalConfiguration(
  value:
    unknown,
): value is PaperCapitalConfiguration {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const candidate =
    value as Partial<PaperCapitalConfiguration>;

  try {
    if (
      candidate.version !==
        "86.0" ||
      !Number.isSafeInteger(
        candidate.revision,
      ) ||
      !Number.isSafeInteger(
        candidate.updatedAt,
      ) ||
      (
        candidate.source !==
          "DEFAULT" &&
        candidate.source !==
          "DASHBOARD"
      ) ||
      candidate.mode !==
        "PAPER_ONLY" ||
      candidate.currency !==
        "INR" ||
      candidate.liveExecutionAllowed !==
        false ||
      candidate.orderSubmissionAllowed !==
        false
    ) {
      return false;
    }

    validateValues(
      candidate as PaperCapitalConfiguration,
    );

    return true;
  } catch {
    return false;
  }
}

export const paperCapitalConfigurationService =
  new PaperCapitalConfigurationService();
