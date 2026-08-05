import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import {
  CONTROLLER_TRUST_ROOT_SUBTREES,
  type MilestoneProposal,
  type OrchestratorConfig,
  type OrchestratorState,
  type PolicyDecision,
  type PolicyFinding,
  type ProjectProfile,
} from "./contracts.js";
import { protectedSubtreeContaining } from "./protected-roots.js";
import { validateMilestoneProposal } from "./schema.js";
import { verificationCommandSafetyError } from "./command-policy.js";

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function globMatches(pattern: string, candidate: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const normalizedCandidate = normalizePath(candidate);
  let expression = "";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    const next = normalizedPattern[index + 1];
    if (character === "*" && next === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += escapeRegularExpression(character ?? "");
    }
  }
  return new RegExp(`^${expression}$`).test(normalizedCandidate);
}

function patternsOverlap(left: string, right: string): boolean {
  return globMatches(left, right) || globMatches(right, left);
}

export function protectedPathMatches(
  protectedPath: string,
  candidate: string,
): boolean {
  return globMatches(protectedPath.toLowerCase(), candidate.toLowerCase());
}

function protectedPatternsOverlap(
  scope: string,
  protectedPath: string,
): boolean {
  return patternsOverlap(scope.toLowerCase(), protectedPath.toLowerCase());
}

function normalizedObjective(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

function commandText(proposal: MilestoneProposal): string[] {
  return proposal.verificationCommands.map(
    (command) => `${command.executable} ${command.args.join(" ")}`,
  );
}

function addsFinding(
  findings: PolicyFinding[],
  code: string,
  message: string,
  path: string | null = null,
): void {
  findings.push({ code, message, path });
}

function contractStrings(proposal: MilestoneProposal): readonly string[] {
  const vertical = proposal.verticalSlice;
  return [
    proposal.objective,
    proposal.rationale,
    ...proposal.exclusions,
    ...proposal.terminalConditions,
    ...proposal.acceptanceCriteria.flatMap((criterion) => [
      criterion.description,
      criterion.evidence,
    ]),
    ...(vertical?.persistenceReplayEvidence ?? []),
    ...(vertical?.nodeWorkerParityEvidence ?? []),
    vertical?.inspectableConsequence?.description ?? "",
  ].filter((value) => value.length > 0);
}

function hashesTo(value: string, expected: string): boolean {
  return createHash("sha256").update(value).digest("hex") === expected;
}

function pathIsPermitted(proposal: MilestoneProposal, path: string): boolean {
  return proposal.permittedPaths.some((pattern) => globMatches(pattern, path));
}

function wholeDomainSpine(
  text: string,
  spine: ProjectProfile["verticalSpine"],
): boolean {
  const categories = spine.categoryPatterns.map(
    (pattern) => new RegExp(pattern, "i"),
  );
  return (
    categories.filter((pattern) => pattern.test(text)).length >=
    spine.minimumCategories
  );
}

export function evaluateProposal(
  rawProposal: unknown,
  state: OrchestratorState,
  config: OrchestratorConfig,
  currentProfile: "bootstrap" | "readiness",
  now = new Date().toISOString(),
): PolicyDecision {
  const findings: PolicyFinding[] = [];
  const schema = validateMilestoneProposal(rawProposal);
  if (!schema.valid || !schema.value) {
    for (const error of schema.errors)
      addsFinding(findings, "SCHEMA_INVALID", error);
    return {
      schemaVersion: "1.0.0",
      status: "rejected",
      milestoneId: null,
      decidedAt: now,
      findings,
    };
  }
  const proposal = schema.value;
  const requiredConsumer = state.requiredNextVerticalConsumer;
  if (requiredConsumer) {
    const exactConsumer = proposal.id === requiredConsumer.consumerMilestoneId;
    const contractMatched = contractStrings(proposal).some((value) =>
      hashesTo(value, requiredConsumer.consumerContractSha256),
    );
    if (
      !exactConsumer ||
      !proposal.dependencies.includes(requiredConsumer.sourceMilestoneId) ||
      proposal.verticalSlice?.mode !== "integrated" ||
      !contractMatched
    )
      addsFinding(
        findings,
        "REQUIRED_CONSUMER_MISMATCH",
        `The next milestone must be ${requiredConsumer.consumerMilestoneId}, depend on ${requiredConsumer.sourceMilestoneId}, compose it as an integrated slice, and quote its exact consumer contract.`,
      );
  }
  const existing = state.milestones.find(
    (milestone) => milestone.proposal.id === proposal.id,
  );
  if (existing)
    addsFinding(
      findings,
      "DUPLICATE_ID",
      `Milestone ${proposal.id} already exists with status ${existing.status}.`,
    );
  const objective = normalizedObjective(proposal.objective);
  const duplicateObjective = state.milestones.find(
    (milestone) =>
      milestone.status === "completed" &&
      normalizedObjective(milestone.proposal.objective) === objective,
  );
  if (duplicateObjective)
    addsFinding(
      findings,
      "DUPLICATE_COMPLETED_WORK",
      `Objective duplicates completed milestone ${duplicateObjective.proposal.id}.`,
    );

  const completedIds = new Set(
    state.milestones
      .filter((milestone) => milestone.status === "completed")
      .map((milestone) => milestone.proposal.id),
  );
  for (const dependency of proposal.dependencies) {
    if (!completedIds.has(dependency))
      addsFinding(
        findings,
        "DEPENDENCY_NOT_COMPLETED",
        `Dependency ${dependency} is not completed.`,
      );
  }

  if (proposal.permittedPaths.length > config.limits.maximumPermittedPaths)
    addsFinding(
      findings,
      "SCOPE_PATH_LIMIT",
      `Proposal has ${proposal.permittedPaths.length} permitted paths; limit is ${config.limits.maximumPermittedPaths}.`,
    );
  if (
    proposal.acceptanceCriteria.length > config.limits.maximumAcceptanceCriteria
  )
    addsFinding(
      findings,
      "ACCEPTANCE_LIMIT",
      `Proposal has ${proposal.acceptanceCriteria.length} acceptance criteria; limit is ${config.limits.maximumAcceptanceCriteria}.`,
    );
  if (proposal.estimatedFileCount > config.limits.maximumEstimatedFiles)
    addsFinding(
      findings,
      "ESTIMATED_FILE_LIMIT",
      `Proposal estimates ${proposal.estimatedFileCount} files; limit is ${config.limits.maximumEstimatedFiles}.`,
    );
  for (const path of proposal.permittedPaths) {
    const normalized = normalizePath(path);
    if (
      isAbsolute(path) ||
      normalized.split("/").includes("..") ||
      /[\r\n\0]/.test(path)
    )
      addsFinding(
        findings,
        "UNSAFE_SCOPE_PATH",
        "Permitted scope paths must be repository-relative and traversal-free.",
        path,
      );
    if (["*", "**", "**/*", ".", "./"].includes(normalized))
      addsFinding(
        findings,
        "UNBOUNDED_SCOPE",
        "Repository-wide permitted scope is not recoverably bounded.",
        path,
      );
    if (/^(?:apps|packages|tools|tests|docs)\/\*\*\/?\*?$/.test(normalized))
      addsFinding(
        findings,
        "UNBOUNDED_SCOPE",
        "A whole top-level repository area is not a recoverably bounded milestone scope.",
        path,
      );
    for (const protectedPath of config.protectedPaths) {
      if (protectedPatternsOverlap(normalized, protectedPath))
        addsFinding(
          findings,
          "PROTECTED_SCOPE",
          `Permitted scope overlaps protected authority ${protectedPath}.`,
          path,
        );
    }
    for (const subtree of CONTROLLER_TRUST_ROOT_SUBTREES) {
      if (
        protectedPatternsOverlap(normalized, subtree) ||
        protectedPatternsOverlap(normalized, `${subtree}/**`)
      )
        addsFinding(
          findings,
          "PROTECTED_SCOPE",
          `Permitted scope overlaps the protected controller subtree ${subtree}/.`,
          path,
        );
    }
    for (const protectedFile of state.repository.protectedFiles) {
      if (protectedPatternsOverlap(normalized, protectedFile.path))
        addsFinding(
          findings,
          "PROTECTED_BASELINE_SCOPE",
          `Permitted scope overlaps protected baseline ${protectedFile.path}.`,
          path,
        );
    }
  }

  const intent = `${proposal.objective}\n${proposal.rationale}`.toLowerCase();
  const forbiddenIntent = [
    /(?:weaken|remove|delete|skip|bypass|disable).{0,60}(?:acceptance|requirement|verification|protected test)/,
    /(?:reduce|narrow|drop).{0,40}(?:frozen scope|product scope|breadth minimum)/,
    /(?:expose|print|log|derive|guess).{0,40}(?:hidden seed|hidden sequence)/,
  ];
  if (forbiddenIntent.some((pattern) => pattern.test(intent)))
    addsFinding(
      findings,
      "FROZEN_CONTRADICTION",
      "Proposal language contradicts frozen scope, verification, or hidden-validation protections.",
    );

  if (currentProfile === "bootstrap" && proposal.kind === "feature")
    addsFinding(
      findings,
      "BOOTSTRAP_GAMEPLAY_FORBIDDEN",
      "Substantive feature work cannot begin while bootstrap is the package default.",
    );

  const vertical = proposal.verticalSlice;
  if (proposal.kind !== "feature" && vertical?.mode !== "not-applicable")
    addsFinding(
      findings,
      "VERTICAL_SLICE_REQUIRED",
      "Tooling, verification, lifecycle, and documentation proposals must mark the feature vertical slice not-applicable.",
    );
  if (proposal.kind === "feature") {
    if (!vertical || !["integrated", "exception"].includes(vertical.mode))
      addsFinding(
        findings,
        "VERTICAL_SLICE_REQUIRED",
        "Feature milestones must use an integrated vertical slice or one enumerated immediate-consumer exception.",
      );
    else if (vertical.mode === "integrated") {
      if (
        !vertical.userGoal ||
        vertical.publicActionKinds.length === 0 ||
        /(?:;|\band then\b|\bas well as\b|\bplus also\b)/i.test(
          vertical.userGoal ?? "",
        )
      )
        addsFinding(
          findings,
          "PUBLIC_ACTION_REQUIRED",
          "An integrated feature slice needs exactly one primary user goal and at least one normal public action kind.",
        );
      if (
        vertical.sharedRuleOwners.length === 0 ||
        vertical.sharedRuleOwners.some(
          (path) => !pathIsPermitted(proposal, path),
        )
      )
        addsFinding(
          findings,
          "SHARED_RULE_OWNER_REQUIRED",
          "An integrated feature slice needs a permitted smallest shared deterministic rule owner.",
        );
      if (
        !vertical.standardCompositionOwner ||
        !pathIsPermitted(proposal, vertical.standardCompositionOwner)
      )
        addsFinding(
          findings,
          "STANDARD_COMPOSITION_REQUIRED",
          "An integrated feature slice needs a permitted Standard composition owner.",
        );
      if (vertical.persistenceReplayEvidence.length === 0)
        addsFinding(
          findings,
          "PERSISTENCE_REPLAY_REQUIRED",
          "An integrated feature slice needs explicit persistence and replay evidence.",
        );
      if (vertical.nodeWorkerParityEvidence.length === 0)
        addsFinding(
          findings,
          "NODE_WORKER_PARITY_REQUIRED",
          "An integrated feature slice needs explicit Node and production Worker parity evidence.",
        );
      if (
        !vertical.inspectableConsequence ||
        vertical.inspectableConsequence.readModelPaths.length === 0 ||
        (vertical.inspectableConsequence.browserEvidenceRequired &&
          !proposal.requiresBrowserInspection)
      )
        addsFinding(
          findings,
          "INSPECTABLE_CONSEQUENCE_REQUIRED",
          "An integrated feature slice needs one read-model consequence and any required browser inspection.",
        );
      if (vertical.exception !== null)
        addsFinding(
          findings,
          "VERTICAL_SLICE_REQUIRED",
          "An integrated slice cannot also declare an exception.",
        );
      if (
        proposal.verificationCommands.filter(
          (command) => command.parser !== "pnpm-verify",
        ).length === 0
      )
        addsFinding(
          findings,
          "VERTICAL_SLICE_REQUIRED",
          "An integrated feature slice needs focused verification in addition to full closure.",
        );
      const verticalText = `${proposal.objective}\n${proposal.rationale}\n${vertical.userGoal ?? ""}`;
      if (
        wholeDomainSpine(verticalText, config.project.verticalSpine) ||
        /(?:;|\n[-*])/.test(vertical.inspectableConsequence?.description ?? "")
      )
        addsFinding(
          findings,
          "VERTICAL_SLICE_REQUIRED",
          "A feature worker attempt cannot combine the whole product spine or multiple unrelated inspectable consequences.",
        );
    } else {
      const exception = vertical.exception;
      if (!exception || exception.justification.trim().length === 0)
        addsFinding(
          findings,
          "EXCEPTION_JUSTIFICATION_REQUIRED",
          "A vertical-slice exception needs one of the four enumerated kinds and a specific justification.",
        );
      if (
        !exception ||
        exception.immediateConsumerMilestoneId === proposal.id ||
        exception.consumerContract.trim().length === 0 ||
        state.milestones.some(
          (milestone) =>
            milestone.proposal.id === exception.immediateConsumerMilestoneId &&
            milestone.status === "completed",
        )
      )
        addsFinding(
          findings,
          "IMMEDIATE_CONSUMER_REQUIRED",
          "A vertical-slice exception needs a future, distinct immediate consumer and an exact consumer contract.",
        );
      if (
        vertical.userGoal !== null ||
        vertical.publicActionKinds.length > 0 ||
        vertical.sharedRuleOwners.length > 0 ||
        vertical.standardCompositionOwner !== null ||
        vertical.persistenceReplayEvidence.length > 0 ||
        vertical.nodeWorkerParityEvidence.length > 0 ||
        vertical.inspectableConsequence !== null
      )
        addsFinding(
          findings,
          "VERTICAL_SLICE_REQUIRED",
          "An exception must remain a narrow precursor and cannot claim integrated feature evidence.",
        );
    }
  }

  const commands = commandText(proposal);
  for (const requiredTest of proposal.requiredTests) {
    if (!commands.includes(requiredTest))
      addsFinding(
        findings,
        "REQUIRED_TEST_COMMAND_MISSING",
        `Required test is not present as an exact verification command: ${requiredTest}.`,
      );
  }
  for (const command of proposal.verificationCommands) {
    const safetyError = verificationCommandSafetyError(command);
    if (safetyError)
      addsFinding(findings, "UNSAFE_VERIFICATION_COMMAND", safetyError);
  }
  const authoritativeCommands = proposal.verificationCommands.filter(
    (command) => command.parser === "pnpm-verify",
  );
  if (
    authoritativeCommands.length !== 1 ||
    authoritativeCommands[0]?.executable !== "pnpm" ||
    authoritativeCommands[0]?.args[0] !== "verify"
  )
    addsFinding(
      findings,
      "AUTHORITATIVE_VERIFY_REQUIRED",
      "Exactly one verification command must parse an argv-form pnpm verify result.",
    );
  if (
    proposal.requiresBrowserInspection &&
    !commands.some((command) => /(?:browser|playwright|visual)/i.test(command))
  )
    addsFinding(
      findings,
      "BROWSER_EVIDENCE_MISSING",
      "A browser-changing milestone needs an explicit browser/Playwright/visual command.",
    );
  if (
    proposal.requiresHeadlessEvaluation &&
    !commands.some((command) =>
      /(?:headless|determinism|parity|simulation)/i.test(command),
    )
  )
    addsFinding(
      findings,
      "HEADLESS_EVIDENCE_MISSING",
      "A simulation-changing milestone needs an explicit headless/determinism/parity command.",
    );

  if (proposal.hiddenValidation.requested) {
    if (!config.hiddenValidationEnabled)
      addsFinding(
        findings,
        "HIDDEN_VALIDATION_DISABLED",
        "Local orchestrator configuration does not authorize hidden validation.",
      );
    const last = state.hiddenValidation.lastCheckpointAt;
    if (
      last &&
      Date.parse(now) - Date.parse(last) <
        config.limits.hiddenValidationCooldownMs
    )
      addsFinding(
        findings,
        "HIDDEN_VALIDATION_RATE_LIMIT",
        "The frozen hidden-validation cooldown has not elapsed.",
      );
  }

  return {
    schemaVersion: "1.0.0",
    status: findings.length === 0 ? "accepted" : "rejected",
    milestoneId: proposal.id,
    decidedAt: now,
    findings,
  };
}

export interface DiffPolicyResult {
  readonly allowed: boolean;
  readonly protectedChanges: readonly string[];
  readonly outOfScopeChanges: readonly string[];
}

export function enforceDiffPolicy(
  changedPaths: readonly string[],
  proposal: MilestoneProposal,
  protectedPaths: readonly string[],
): DiffPolicyResult {
  const normalizedChanges = changedPaths.map(normalizePath);
  const protectedChanges = normalizedChanges.filter(
    (path) =>
      protectedPaths.some((pattern) => protectedPathMatches(pattern, path)) ||
      protectedSubtreeContaining(path) !== null,
  );
  const outOfScopeChanges = normalizedChanges.filter(
    (path) =>
      !proposal.permittedPaths.some((pattern) => globMatches(pattern, path)),
  );
  return {
    allowed: protectedChanges.length === 0 && outOfScopeChanges.length === 0,
    protectedChanges,
    outOfScopeChanges,
  };
}
