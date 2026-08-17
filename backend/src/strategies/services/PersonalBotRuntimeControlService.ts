import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

export interface PersonalBotRuntimeControl {
  readonly version: "82.0";

  readonly enabled: boolean;

  readonly updatedAt: number;

  readonly source:
    | "DEFAULT"
    | "DASHBOARD";

  readonly mode: "PAPER_ONLY";

  readonly liveExecutionAllowed: false;

  readonly orderSubmissionAllowed: false;
}

const DEFAULT_CONTROL_FILE =
  resolve(
    process.cwd(),
    "logs",
    "control",
    "personal-bot-runtime.jsonl",
  );

export class PersonalBotRuntimeControlService {
  private readonly store:
    JsonlSnapshotStore<PersonalBotRuntimeControl>;

  private control:
    PersonalBotRuntimeControl;

  constructor(
    persistenceFilePath =
      DEFAULT_CONTROL_FILE,

    now =
      Date.now(),
  ) {
    this.store =
      new JsonlSnapshotStore<PersonalBotRuntimeControl>({
        filePath:
          persistenceFilePath,

        isPayload:
          isPersonalBotRuntimeControl,
      });

    const records =
      this.store.readAll();

    this.control =
      records.at(-1) ??
      createControl(
        true,
        now,
        "DEFAULT",
      );
  }

  getControl():
    PersonalBotRuntimeControl {
    return structuredClone(
      this.control,
    );
  }

  setEnabled(
    enabled:
      boolean,

    now =
      Date.now(),
  ): PersonalBotRuntimeControl {
    if (
      typeof enabled !==
        "boolean"
    ) {
      throw new Error(
        "Personal bot enabled state must be boolean.",
      );
    }

    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "Personal bot control timestamp must be a positive safe integer.",
      );
    }

    if (
      this.control.enabled ===
        enabled
    ) {
      return this.getControl();
    }

    const next =
      createControl(
        enabled,
        now,
        "DASHBOARD",
      );

    this.store.append(
      next,
    );

    this.control =
      next;

    return this.getControl();
  }
}

function createControl(
  enabled:
    boolean,

  updatedAt:
    number,

  source:
    PersonalBotRuntimeControl["source"],
): PersonalBotRuntimeControl {
  return {
    version:
      "82.0",

    enabled,

    updatedAt,

    source,

    mode:
      "PAPER_ONLY",

    liveExecutionAllowed:
      false,

    orderSubmissionAllowed:
      false,
  };
}

function isPersonalBotRuntimeControl(
  value:
    unknown,
): value is PersonalBotRuntimeControl {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const candidate =
    value as Partial<PersonalBotRuntimeControl>;

  return (
    candidate.version ===
      "82.0" &&
    typeof candidate.enabled ===
      "boolean" &&
    Number.isSafeInteger(
      candidate.updatedAt,
    ) &&
    (
      candidate.source ===
        "DEFAULT" ||
      candidate.source ===
        "DASHBOARD"
    ) &&
    candidate.mode ===
      "PAPER_ONLY" &&
    candidate.liveExecutionAllowed ===
      false &&
    candidate.orderSubmissionAllowed ===
      false
  );
}

export const personalBotRuntimeControlService =
  new PersonalBotRuntimeControlService();
