import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  PersonalOpportunityCandidateConversion,
} from "@/modules/strategies/types/PersonalStrategyOneBot";

import {
  resolvePaperCandidateStatus,
  type PaperCandidateSnapshotState,
} from "./paperCandidateStatus";

const successfulSnapshot:
  PaperCandidateSnapshotState = {
    hasSnapshot:
      true,
    isPending:
      false,
    isFetching:
      false,
    isError:
      false,
  };

describe(
  "resolvePaperCandidateStatus",
  () => {
    it(
      "does not infer PAPER readiness while the authoritative snapshot is loading",
      () => {
        expect(
          resolvePaperCandidateStatus(
            undefined,
            {
              ...successfulSnapshot,
              hasSnapshot:
                false,
              isPending:
                true,
            },
          ),
        ).toMatchObject({
          state:
            "CHECKING",
          label:
            "PAPER STATUS CHECKING",
        });
      },
    );

    it(
      "reports an unavailable authoritative snapshot instead of a pass",
      () => {
        expect(
          resolvePaperCandidateStatus(
            undefined,
            {
              ...successfulSnapshot,
              isError:
                true,
            },
          ),
        ).toMatchObject({
          state:
            "WAITING",
          label:
            "PAPER STATUS UNAVAILABLE",
        });
      },
    );

    it(
      "reports a route missing from a completed authoritative snapshot",
      () => {
        expect(
          resolvePaperCandidateStatus(
            undefined,
            successfulSnapshot,
          ),
        ).toMatchObject({
          state:
            "WAITING",
          label:
            "PAPER NOT OBSERVED",
        });
      },
    );

    it(
      "preserves an explicit selectable PAPER candidate",
      () => {
        const candidate = {
          selectableForPaper:
            true,
          reason:
            "Authoritative candidate is ready.",
        } as PersonalOpportunityCandidateConversion;

        expect(
          resolvePaperCandidateStatus(
            candidate,
            successfulSnapshot,
          ),
        ).toEqual({
          state:
            "READY",
          label:
            "PAPER READY",
          reason:
            "Authoritative candidate is ready.",
        });
      },
    );

    it(
      "fails closed when a refresh errors even if cached readiness exists",
      () => {
        const candidate = {
          selectableForPaper:
            true,
          reason:
            "Cached candidate was ready.",
        } as PersonalOpportunityCandidateConversion;

        expect(
          resolvePaperCandidateStatus(
            candidate,
            {
              ...successfulSnapshot,
              isError:
                true,
            },
          ).label,
        ).toBe(
          "PAPER STATUS UNAVAILABLE",
        );
      },
    );
  },
);
