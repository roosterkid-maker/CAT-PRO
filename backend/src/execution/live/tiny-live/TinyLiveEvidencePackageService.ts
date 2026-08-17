import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
  type JsonlSnapshotStoreDiagnostics,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  CAT_PRO_TARGET_EXCHANGES,
  type CatProTargetExchange,
} from "../../../exchanges/core/ExchangeFleetRegistry";

import {
  fiveExchangeReadinessObservationService,
} from "../../../exchanges/services/FiveExchangeReadinessObservationService";

import {
  fiveExchangeGoNoGoService,
  type FiveExchangeGoNoGoExchange,
  type FiveExchangeGoNoGoGate,
} from "../readiness/FiveExchangeGoNoGoService";

import {
  v18ProductionReadinessService,
} from "../readiness/V18ProductionReadinessService";

const REQUIRED_SEAL_CONFIRMATION =
  "SEAL_TINY_LIVE_EVIDENCE_ONLY";

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "readiness",
    "tiny-live-evidence-packages.jsonl",
  );

const MAXIMUM_ARCHIVE_RECORDS =
  1_000;

export interface TinyLiveEvidencePackageBody {
  schemaVersion: 1;

  milestone: "19.36";

  generatedAt: number;

  recordKind:
    | "PREVIEW"
    | "SEALED";

  mode:
    "TINY_LIVE_CONTENT_ADDRESSED_EVIDENCE";

  decision:
    | "NO_GO"
    | "GO_FOR_AUDITED_ACTIVATION_REVIEW";

  activationReviewEligible: boolean;

  targetExchanges:
    CatProTargetExchange[];

  tinyLivePolicy: {
    minimumCapital: 100;

    maximumCapital: 500;

    currency: "INR";

    preflightOnly: true;

    sealConfirmationRequired: true;
  };

  safety: {
    liveTradingEnabled: false;

    liveSubmissionAllowed: false;

    automaticPromotionAllowed: false;

    orderSubmissionPerformed: false;

    capitalReserved: false;

    liveSessionCreated: false;

    accountModeChanged: false;
  };

  evidence: {
    rollingReadiness: {
      version: "19.34";

      generatedAt: number;

      status:
        | "INSUFFICIENT_EVIDENCE"
        | "UNSTABLE"
        | "STABLE";

      allFiveRollingShadowStable:
        boolean;

      allFiveRollingPaperStable:
        boolean;

      policy:
        ReturnType<
          typeof fiveExchangeReadinessObservationService.getReport
        >["policy"];

      observationEvidence:
        ReturnType<
          typeof fiveExchangeReadinessObservationService.getReport
        >["evidence"];
    };

    goNoGo: {
      version: "19.35";

      generatedAt: number;

      decision:
        | "NO_GO"
        | "GO_FOR_AUDITED_ACTIVATION_REVIEW";

      activationReviewEligible:
        boolean;

      summary:
        ReturnType<
          typeof fiveExchangeGoNoGoService.getReport
        >["summary"];

      gates:
        FiveExchangeGoNoGoGate[];

      exchanges:
        FiveExchangeGoNoGoExchange[];

      blockers: string[];

      sourceGeneratedAt:
        ReturnType<
          typeof fiveExchangeGoNoGoService.getReport
        >["sourceGeneratedAt"];
    };

    v18Acceptance: {
      version: "18.0";

      build: "16";

      generatedAt: number;

      status:
        ReturnType<
          typeof v18ProductionReadinessService.getReport
        >["status"];

      hardeningAccepted:
        boolean;

      tinyLiveOperationalReady:
        boolean;

      summary:
        ReturnType<
          typeof v18ProductionReadinessService.getReport
        >["summary"];

      blockers:
        ReturnType<
          typeof v18ProductionReadinessService.getReport
        >["blockers"];
    };
  };

  blockers: string[];

  notes: string[];
}

export interface TinyLiveEvidencePackage
  extends TinyLiveEvidencePackageBody {
  packageId: string;

  integrity: {
    algorithm: "SHA-256";

    digest: string;

    canonicalization:
      "SORTED_JSON_KEYS_V1";

    verifiedAtGeneration: true;
  };
}

export interface TinyLiveEvidencePackageArchiveReport {
  generatedAt: number;

  version: "19.36";

  mode:
    "TINY_LIVE_EVIDENCE_ARCHIVE";

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  totalSealedPackages: number;

  latest: Array<{
    packageId: string;

    generatedAt: number;

    decision:
      TinyLiveEvidencePackage["decision"];

    integrityVerified: boolean;
  }>;

  persistence:
    JsonlSnapshotStoreDiagnostics;

  persistenceHealthy: boolean;

  notes: string[];
}

type RollingSource =
  Pick<
    typeof fiveExchangeReadinessObservationService,
    "getReport"
  >;

type GoNoGoSource =
  Pick<
    typeof fiveExchangeGoNoGoService,
    "getReport"
  >;

type V18Source =
  Pick<
    typeof v18ProductionReadinessService,
    "getReport"
  >;

export interface TinyLiveEvidencePackageOptions {
  rollingSource?: RollingSource;

  goNoGoSource?: GoNoGoSource;

  v18Source?: V18Source;

  persistenceFilePath?: string;

  now?: () => number;
}

export class TinyLiveEvidencePackageService {
  private readonly rollingSource:
    RollingSource;

  private readonly goNoGoSource:
    GoNoGoSource;

  private readonly v18Source:
    V18Source;

  private readonly store:
    JsonlSnapshotStore<
      TinyLiveEvidencePackage
    >;

  private readonly now:
    () => number;

  private readonly archive:
    TinyLiveEvidencePackage[];

  constructor(
    options:
      TinyLiveEvidencePackageOptions = {},
  ) {
    this.rollingSource =
      options.rollingSource ??
      fiveExchangeReadinessObservationService;

    this.goNoGoSource =
      options.goNoGoSource ??
      fiveExchangeGoNoGoService;

    this.v18Source =
      options.v18Source ??
      v18ProductionReadinessService;

    this.now =
      options.now ??
      Date.now;

    this.store =
      new JsonlSnapshotStore<
        TinyLiveEvidencePackage
      >({
        filePath:
          options.persistenceFilePath ??
          DEFAULT_PERSISTENCE_FILE,
        isPayload:
          (value): value is TinyLiveEvidencePackage =>
            this.isPackage(
              value,
            ),
      });

    this.archive =
      this.store
        .readAll()
        .filter(
          (item) =>
            item.recordKind ===
            "SEALED",
        )
        .sort(
          (first, second) =>
            first.generatedAt -
            second.generatedAt,
        )
        .slice(
          -MAXIMUM_ARCHIVE_RECORDS,
        );
  }

  buildPreview():
    TinyLiveEvidencePackage {
    return this.buildPackage(
      "PREVIEW",
    );
  }

  seal(
    confirmationToken: string,
  ): TinyLiveEvidencePackage {
    if (
      confirmationToken.trim() !==
      REQUIRED_SEAL_CONFIRMATION
    ) {
      throw new Error(
        `Evidence sealing requires confirmationToken ${REQUIRED_SEAL_CONFIRMATION}.`,
      );
    }

    const evidencePackage =
      this.buildPackage(
        "SEALED",
      );

    this.store.append(
      evidencePackage,
    );

    this.archive.push(
      evidencePackage,
    );

    if (
      this.archive.length >
      MAXIMUM_ARCHIVE_RECORDS
    ) {
      this.archive.splice(
        0,
        this.archive.length -
          MAXIMUM_ARCHIVE_RECORDS,
      );
    }

    return structuredClone(
      evidencePackage,
    );
  }

  verifyIntegrity(
    evidencePackage:
      TinyLiveEvidencePackage,
  ): boolean {
    const {
      packageId,
      integrity,
      ...body
    } = evidencePackage;

    const digest =
      this.digest(
        body,
      );

    return (
      integrity.algorithm ===
        "SHA-256" &&
      integrity.canonicalization ===
        "SORTED_JSON_KEYS_V1" &&
      integrity.digest ===
        digest &&
      packageId ===
        `sha256:${digest}`
    );
  }

  getArchiveReport():
    TinyLiveEvidencePackageArchiveReport {
    const persistence =
      this.store
        .getDiagnostics();

    return {
      generatedAt:
        this.now(),
      version:
        "19.36",
      mode:
        "TINY_LIVE_EVIDENCE_ARCHIVE",
      liveTradingEnabled:
        false,
      liveSubmissionAllowed:
        false,
      totalSealedPackages:
        this.archive.length,
      latest:
        this.archive
          .slice(
            -20,
          )
          .reverse()
          .map(
            (evidencePackage) => ({
              packageId:
                evidencePackage.packageId,
              generatedAt:
                evidencePackage.generatedAt,
              decision:
                evidencePackage.decision,
              integrityVerified:
                this.verifyIntegrity(
                  evidencePackage,
                ),
            }),
          ),
      persistence,
      persistenceHealthy:
        persistence.writeFailures ===
          0 &&
        persistence.lastError ===
          null &&
        this.archive.every(
          (evidencePackage) =>
            this.verifyIntegrity(
              evidencePackage,
            ),
        ),
      notes: [
        "Sealed evidence packages are append-only JSONL records and are restored after restart.",
        "The content digest covers every package field except packageId and integrity metadata.",
        "Changing any covered field changes the SHA-256 package identifier.",
        "Archive writes never alter account mode, capital, LIVE sessions, or exchange orders.",
        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private buildPackage(
    recordKind:
      TinyLiveEvidencePackageBody["recordKind"],
  ): TinyLiveEvidencePackage {
    const rolling =
      this.rollingSource
        .getReport();

    const goNoGo =
      this.goNoGoSource
        .getReport();

    const v18 =
      this.v18Source
        .getReport();

    const body:
      TinyLiveEvidencePackageBody = {
      schemaVersion:
        1,
      milestone:
        "19.36",
      generatedAt:
        this.now(),
      recordKind,
      mode:
        "TINY_LIVE_CONTENT_ADDRESSED_EVIDENCE",
      decision:
        goNoGo.decision,
      activationReviewEligible:
        goNoGo.activationReviewEligible,
      targetExchanges: [
        ...CAT_PRO_TARGET_EXCHANGES,
      ],
      tinyLivePolicy: {
        minimumCapital:
          100,
        maximumCapital:
          500,
        currency:
          "INR",
        preflightOnly:
          true,
        sealConfirmationRequired:
          true,
      },
      safety: {
        liveTradingEnabled:
          false,
        liveSubmissionAllowed:
          false,
        automaticPromotionAllowed:
          false,
        orderSubmissionPerformed:
          false,
        capitalReserved:
          false,
        liveSessionCreated:
          false,
        accountModeChanged:
          false,
      },
      evidence: {
        rollingReadiness: {
          version:
            rolling.version,
          generatedAt:
            rolling.generatedAt,
          status:
            rolling.status,
          allFiveRollingShadowStable:
            rolling.allFiveRollingShadowStable,
          allFiveRollingPaperStable:
            rolling.allFiveRollingPaperStable,
          policy:
            structuredClone(
              rolling.policy,
            ),
          observationEvidence:
            structuredClone(
              rolling.evidence,
            ),
        },
        goNoGo: {
          version:
            goNoGo.version,
          generatedAt:
            goNoGo.generatedAt,
          decision:
            goNoGo.decision,
          activationReviewEligible:
            goNoGo.activationReviewEligible,
          summary:
            structuredClone(
              goNoGo.summary,
            ),
          gates:
            structuredClone(
              goNoGo.gates,
            ),
          exchanges:
            structuredClone(
              goNoGo.exchanges,
            ),
          blockers:
            [
              ...goNoGo.blockers,
            ],
          sourceGeneratedAt:
            structuredClone(
              goNoGo.sourceGeneratedAt,
            ),
        },
        v18Acceptance: {
          version:
            v18.version,
          build:
            v18.build,
          generatedAt:
            v18.generatedAt,
          status:
            v18.status,
          hardeningAccepted:
            v18.v18HardeningAccepted,
          tinyLiveOperationalReady:
            v18.tinyLiveOperationalReady,
          summary:
            structuredClone(
              v18.summary,
            ),
          blockers:
            structuredClone(
              v18.blockers,
            ),
        },
      },
      blockers: [
        ...goNoGo.blockers,
      ],
      notes: [
        "This package seals observed readiness and safety evidence; it does not assert a fill, balance, profit, or future exchange state.",
        "GO_FOR_AUDITED_ACTIVATION_REVIEW is not authorization to enable or submit LIVE trading.",
        "NO_GO is preserved as evidence and is never converted to a positive decision by packaging.",
        "No credential value, authorization header, or signing secret is included.",
        "Preview and sealing perform no exchange order, capital reservation, LIVE session creation, or account-mode change.",
        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };

    const digest =
      this.digest(
        body,
      );

    return {
      ...body,
      packageId:
        `sha256:${digest}`,
      integrity: {
        algorithm:
          "SHA-256",
        digest,
        canonicalization:
          "SORTED_JSON_KEYS_V1",
        verifiedAtGeneration:
          true,
      },
    };
  }

  private digest(
    value: unknown,
  ): string {
    return createHash(
      "sha256",
    )
      .update(
        this.canonicalStringify(
          value,
        ),
        "utf8",
      )
      .digest(
        "hex",
      );
  }

  private canonicalStringify(
    value: unknown,
  ): string {
    const serialized =
      JSON.stringify(
        this.sortKeys(
          value,
        ),
      );

    if (
      serialized ===
      undefined
    ) {
      throw new Error(
        "Tiny-LIVE evidence package cannot be canonicalized.",
      );
    }

    return serialized;
  }

  private sortKeys(
    value: unknown,
  ): unknown {
    if (
      Array.isArray(
        value,
      )
    ) {
      return value.map(
        (item) =>
          this.sortKeys(
            item,
          ),
      );
    }

    if (
      typeof value ===
        "object" &&
      value !==
        null
    ) {
      const record =
        value as Record<
          string,
          unknown
        >;

      return Object.keys(
        record,
      )
        .sort()
        .reduce<
          Record<
            string,
            unknown
          >
        >(
          (
            sorted,
            key,
          ) => {
            sorted[key] =
              this.sortKeys(
                record[key],
              );

            return sorted;
          },
          {},
        );
    }

    return value;
  }

  private isPackage(
    value: unknown,
  ): value is TinyLiveEvidencePackage {
    if (
      typeof value !==
        "object" ||
      value ===
        null ||
      Array.isArray(
        value,
      )
    ) {
      return false;
    }

    const record =
      value as Record<
        string,
        unknown
      >;

    if (
      record.schemaVersion !==
        1 ||
      record.milestone !==
        "19.36" ||
      record.recordKind !==
        "SEALED" ||
      typeof record.packageId !==
        "string" ||
      !record.packageId.startsWith(
        "sha256:",
      )
    ) {
      return false;
    }

    const safety =
      typeof record.safety ===
        "object" &&
      record.safety !==
        null &&
      !Array.isArray(
        record.safety,
      )
        ? record.safety as Record<
            string,
            unknown
          >
        : null;

    if (
      !safety ||
      safety.liveTradingEnabled !==
        false ||
      safety.liveSubmissionAllowed !==
        false ||
      safety.automaticPromotionAllowed !==
        false ||
      safety.orderSubmissionPerformed !==
        false ||
      safety.capitalReserved !==
        false ||
      safety.liveSessionCreated !==
        false ||
      safety.accountModeChanged !==
        false
    ) {
      return false;
    }

    return this.verifyIntegrity(
      value as TinyLiveEvidencePackage,
    );
  }
}

export const tinyLiveEvidencePackageService =
  new TinyLiveEvidencePackageService();
