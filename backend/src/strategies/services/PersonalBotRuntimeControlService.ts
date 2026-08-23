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

export interface PersonalBotPaperRuntimeArmInput {
  readonly control: PersonalBotRuntimeControl;

  readonly account: {
    readonly enabled: boolean;

    readonly mode: "PAPER" | "TESTNET" | "LIVE";

    readonly emergencyStop: boolean;
  };
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
        false,
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

/**
 * The persisted dashboard control is the operator's authoritative PAPER arm.
 * A default value is never sufficient: the operator must have explicitly
 * changed the control through the dashboard, and the durable trading account
 * must still be in its fail-closed PAPER state.
 */
export function isPersonalBotPaperRuntimeArmed(
  input:
    PersonalBotPaperRuntimeArmInput,
): boolean {
  return (
    input.control.enabled &&
    input.control.source === "DASHBOARD" &&
    input.account.enabled &&
    input.account.mode === "PAPER" &&
    !input.account.emergencyStop
  );
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
