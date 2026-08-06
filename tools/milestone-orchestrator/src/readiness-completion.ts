import {
  READINESS_VERIFICATION_STAGE_IDS,
  type AuthoritativeVerificationSummary,
} from "./contracts.js";

export function authoritativeStageSetsAreConsistent(
  authoritative: AuthoritativeVerificationSummary,
): boolean {
  if (
    authoritative.profileId !== "readiness" ||
    !Array.isArray(authoritative.stages) ||
    !Array.isArray(authoritative.passingStageIds) ||
    !Array.isArray(authoritative.notReadyStageIds) ||
    !Array.isArray(authoritative.previouslyPassingStageIds) ||
    authoritative.requiredStageCount !==
      READINESS_VERIFICATION_STAGE_IDS.length ||
    authoritative.stages.length !== READINESS_VERIFICATION_STAGE_IDS.length ||
    authoritative.stages.some(
      (stage, index) =>
        typeof stage?.id !== "string" ||
        stage.id !== READINESS_VERIFICATION_STAGE_IDS[index] ||
        (stage.status !== "PASS" && stage.status !== "NOT_READY"),
    ) ||
    (authoritative.readinessHistoryMode !== "first-readiness-transition" &&
      authoritative.readinessHistoryMode !== "durable-records")
  )
    return false;
  const stageIds = authoritative.stages.map((stage) => stage.id);
  const expectedPassing = authoritative.stages
    .filter((stage) => stage.status === "PASS")
    .map((stage) => stage.id);
  const expectedNotReady = authoritative.stages
    .filter((stage) => stage.status === "NOT_READY")
    .map((stage) => stage.id);
  const previousIds = authoritative.previouslyPassingStageIds;
  return (
    new Set(stageIds).size === stageIds.length &&
    new Set(previousIds).size === previousIds.length &&
    previousIds.every(
      (stageId) =>
        READINESS_VERIFICATION_STAGE_IDS.includes(stageId as never) &&
        expectedPassing.includes(stageId),
    ) &&
    ((authoritative.readinessHistoryMode === "first-readiness-transition" &&
      previousIds.length === 0) ||
      (authoritative.readinessHistoryMode === "durable-records" &&
        previousIds.length > 0)) &&
    authoritative.passingStageIds.length === expectedPassing.length &&
    authoritative.passingStageIds.every(
      (stageId, index) => stageId === expectedPassing[index],
    ) &&
    authoritative.notReadyStageIds.length === expectedNotReady.length &&
    authoritative.notReadyStageIds.every(
      (stageId, index) => stageId === expectedNotReady[index],
    )
  );
}

export function humanPlaytestStopReason(
  authoritative: AuthoritativeVerificationSummary | null | undefined,
): string | null {
  if (
    authoritative?.status === "PASS" &&
    authoritative.exitCode === 0 &&
    authoritative.disposition === "completion-eligible" &&
    authoritative.profileId === "readiness" &&
    authoritative.completionClaim === "autonomous_readiness" &&
    authoritative.completionEligible === true &&
    authoritative.profileAutonomousReadinessEquivalent === true &&
    authoritative.autonomousReadinessEquivalent === true &&
    authoritativeStageSetsAreConsistent(authoritative) &&
    authoritative.notReadyStageIds.length === 0 &&
    authoritative.passingStageIds.length === authoritative.requiredStageCount
  )
    return "Final autonomous-readiness verification passed; stop for human playtesting.";
  return null;
}
