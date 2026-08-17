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
  TinyLiveEvidencePackageService,
} from "../tiny-live/TinyLiveEvidencePackageService";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function main(): void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-v1936-",
      ),
    );

  const persistenceFilePath =
    join(
      directory,
      "tiny-live-evidence.jsonl",
    );

  const now =
    () =>
      1_800_000_000_000;

  try {
    const service =
      new TinyLiveEvidencePackageService({
        persistenceFilePath,
        now,
      });

    const preview =
      service.buildPreview();

    assertCondition(
      preview.recordKind ===
        "PREVIEW" &&
      service.verifyIntegrity(
        preview,
      ) &&
      preview.targetExchanges.length ===
        5 &&
      !preview.safety
        .liveTradingEnabled &&
      !preview.safety
        .liveSubmissionAllowed &&
      !preview.safety
        .orderSubmissionPerformed &&
      !preview.safety
        .capitalReserved,
      "Preview package must be content-addressed, cover five exchanges, and preserve all LIVE-disabled invariants.",
    );

    const tampered =
      structuredClone(
        preview,
      );

    tampered.blockers.push(
      "tampered",
    );

    assertCondition(
      !service.verifyIntegrity(
        tampered,
      ),
      "Changing covered evidence must invalidate the package SHA-256 digest.",
    );

    let confirmationBlocked =
      false;

    try {
      service.seal(
        "WRONG_TOKEN",
      );
    } catch {
      confirmationBlocked =
        true;
    }

    assertCondition(
      confirmationBlocked &&
      service.getArchiveReport()
        .totalSealedPackages ===
        0,
      "Evidence sealing must fail closed without the evidence-only confirmation token.",
    );

    const sealed =
      service.seal(
        "SEAL_TINY_LIVE_EVIDENCE_ONLY",
      );

    assertCondition(
      sealed.recordKind ===
        "SEALED" &&
      service.verifyIntegrity(
        sealed,
      ) &&
      service.getArchiveReport()
        .totalSealedPackages ===
        1,
      "Confirmed sealing must append one valid content-addressed evidence record.",
    );

    const restored =
      new TinyLiveEvidencePackageService({
        persistenceFilePath,
        now,
      });

    const archive =
      restored.getArchiveReport();

    assertCondition(
      archive.totalSealedPackages ===
        1 &&
      archive.persistenceHealthy &&
      archive.latest[0]
        ?.integrityVerified ===
        true &&
      archive.latest[0]
        ?.packageId ===
        sealed.packageId,
      "Sealed Tiny-LIVE evidence must restore from restart-safe JSONL with verified integrity.",
    );

    console.log(
      "TINY-LIVE EVIDENCE PACKAGE TEST PASSED.",
    );

    console.log(
      "Only isolated evidence was sealed; no exchange request, order, capital reservation, LIVE session, or account-mode change occurred.",
    );
  } finally {
    rmSync(
      directory,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
}

main();
