import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { evidenceContext, writeJson, writeReceipt } from "../../evidence.mjs";
import { runLoopCli } from "./cli.js";
import { SdkCodexGateway, type CodexClientLike } from "./codex-gateway.js";
import { loadConfig } from "./config.js";
import { inventoryContainerArtifacts } from "./container-artifacts.js";
import { captureProtectedFiles } from "./git-isolation.js";
import {
  QUALIFICATION_INPUT_DESTINATION,
  QUALIFICATION_INPUT_LIMITS,
  validateQualificationInput,
  type TrustedQualificationInput,
} from "./qualification-input.js";
import { assertMilestoneProposal, assertOrchestratorState } from "./schema.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

export const PLANNING_QUALIFICATION_CASES = [
  "planning-admission",
  "planning-protected-path-rejection",
] as const;
export const PLANNING_QUALIFICATION_STAGE = "qualification-planning";
export const PLANNING_PRODUCER_COMMAND = "planning-producer";
export const PLANNING_CONSUMER_COMMAND = "planning-consumer";
export const PLANNING_FIXTURE_PATH = "fixtures/source-planning/proposal.json";

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  }).trim();
}

function digest(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function produce(): Promise<void> {
  // This harness is intentionally unavailable as an uncontained workstation
  // controller. The outer executor authenticates the actual OCI policy.
  assert.equal(process.platform, "linux");
  assert.equal(process.getuid?.(), 65532);
  assert.equal(process.cwd(), "/workspace");
  const source = {
    commit: git("/workspace", ["rev-parse", "HEAD"]),
    tree: git("/workspace", ["rev-parse", "HEAD^{tree}"]),
  };
  const context = await evidenceContext(
    PLANNING_QUALIFICATION_STAGE,
    PLANNING_PRODUCER_COMMAND,
  );
  const fixtureBytes = await readFile(
    resolve("/source", PLANNING_FIXTURE_PATH),
  );
  const proposal = assertMilestoneProposal(
    JSON.parse(fixtureBytes.toString("utf8")) as unknown,
  );
  for (const caseId of PLANNING_QUALIFICATION_CASES) {
    const root = resolve("/workspace/qualification-cases", caseId);
    const retained = resolve(context.artifactDirectory, caseId);
    await cp("/source", root, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const config = await loadConfig(root);
    // Normal fixture checkout setup, before the public controller initializes.
    git(root, ["checkout", "--quiet", "-B", config.targetBranch, "HEAD"]);
    git(root, ["config", "user.name", "Planning qualification fixture"]);
    git(root, ["config", "user.email", "qualification@example.invalid"]);
    assert.equal(git(root, ["status", "--porcelain=v1"]), "");
    assert.equal(
      git(root, [
        "for-each-ref",
        "--format=%(refname)",
        "refs/milestone-loop/",
      ]),
      "",
    );
    const protectedBefore = await captureProtectedFiles(
      root,
      config.protectedPaths,
    );
    const supplied =
      caseId === "planning-admission"
        ? proposal
        : { ...proposal, permittedPaths: ["PROJECT_GOAL.md"] };
    const requests: unknown[] = [];
    const threadId = `fixture-${randomUUID()}`;
    const client: CodexClientLike = {
      startThread: (options) => ({
        async runStreamed(prompt) {
          requests.push({
            prompt,
            options,
            proposal: supplied,
            threadId,
            resumed: false,
          });
          return {
            events: (async function* () {
              yield { type: "thread.started" as const, thread_id: threadId };
              yield {
                type: "item.completed" as const,
                item: {
                  id: `proposal-${requests.length}`,
                  type: "agent_message" as const,
                  text: JSON.stringify(supplied),
                },
              };
            })(),
          };
        },
      }),
      resumeThread: (id, options) => ({
        async runStreamed(prompt) {
          assert.equal(id, threadId);
          requests.push({
            prompt,
            options,
            proposal: supplied,
            threadId,
            resumed: true,
          });
          return {
            events: (async function* () {
              yield {
                type: "item.completed" as const,
                item: {
                  id: `proposal-${requests.length}`,
                  type: "agent_message" as const,
                  text: JSON.stringify(supplied),
                },
              };
            })(),
          };
        },
      }),
    };
    const previousDirectory = process.cwd();
    try {
      process.chdir(root);
      await runLoopCli(["plan", "--json"], {
        gateway: new SdkCodexGateway(config, client),
      });
    } finally {
      process.chdir(previousDirectory);
    }
    const state = assertOrchestratorState(
      await json(resolve(root, config.statePath)),
    );
    await mkdir(retained, { recursive: true });
    await cp(
      resolve(root, "artifacts/orchestrator"),
      resolve(retained, "controller"),
      { recursive: true },
    );
    await writeJson(resolve(retained, "transport.json"), {
      kind: "deterministic-role-fixture",
      liveAgents: false,
      usage: null,
      requests,
    });
    const protectedAfter = await captureProtectedFiles(
      root,
      config.protectedPaths,
    );
    const after = {
      commit: git(root, ["rev-parse", "HEAD"]),
      tree: git(root, ["rev-parse", "HEAD^{tree}"]),
    };
    assert.deepEqual(after, source);
    assert.deepEqual(protectedAfter, protectedBefore);
    assert.equal(git(root, ["status", "--porcelain=v1"]), "");
    await writeJson(resolve(retained, "observation.json"), {
      caseId,
      source,
      after,
      protectedBefore,
      protectedAfter,
      plannerAttempts: config.limits.plannerProposalAttempts,
      publicCommand: ["plan", "--json"],
      runDirectory: relative(
        resolve(root, "artifacts/orchestrator"),
        state.run.artifactDirectory ?? "",
      ).replaceAll("\\", "/"),
      targetStatusAfter: "",
    });
  }
  await writeJson(resolve(context.artifactDirectory, "producer-report.json"), {
    schemaVersion: "planning-qualification.v1",
    source,
    fixtureSha256: digest(fixtureBytes),
    coverage: PLANNING_QUALIFICATION_CASES,
    platform: process.platform,
    transport: "deterministic-role-fixture",
    completion: { eligible: false },
  });
  await inspectPlanningObservations(context.artifactDirectory, source);
  const inventory = await inventoryContainerArtifacts(
    context.artifactDirectory,
    QUALIFICATION_INPUT_LIMITS,
  );
  await writeReceipt(
    context,
    PLANNING_QUALIFICATION_CASES.map((id) => ({
      id,
      summary: `Observed ${id} through the public planning CLI dispatch.`,
    })),
    inventory.files.map((file) => ({
      path: file.path,
      kind:
        file.path === "producer-report.json"
          ? "planning-producer-report"
          : "planning-workflow-observation",
    })),
  );
}

/** Read the actual persisted state/decisions, not a producer's boolean claim. */
export async function inspectPlanningObservations(
  directory: string,
  expectedSource: { readonly commit: string; readonly tree: string },
): Promise<void> {
  for (const caseId of PLANNING_QUALIFICATION_CASES) {
    const root = resolve(directory, caseId);
    const state = assertOrchestratorState(
      await json(resolve(root, "controller/state/state.json")),
    );
    const observation = (await json(resolve(root, "observation.json"))) as {
      caseId: string;
      source: unknown;
      after: unknown;
      protectedBefore: unknown;
      protectedAfter: unknown;
      plannerAttempts: number;
      runDirectory: string;
      targetStatusAfter: string;
    };
    assert.equal(observation.caseId, caseId);
    assert.deepEqual(observation.source, expectedSource);
    assert.equal(state.repository.verifiedCommit, expectedSource.commit);
    assert.deepEqual(observation.after, observation.source);
    assert.deepEqual(observation.protectedAfter, observation.protectedBefore);
    assert.equal(observation.targetStatusAfter, "");
    assert.match(observation.runDirectory, /^runs\/loop-[a-z0-9-]+$/);
    const runRoot = resolve(root, "controller", observation.runDirectory);
    const attempts = (await readdir(resolve(runRoot, "planning"))).sort();
    const accepted = caseId === "planning-admission";
    assert.equal(attempts.length, accepted ? 1 : observation.plannerAttempts);
    assert.equal(observation.plannerAttempts, 2);
    const transport = (await json(resolve(root, "transport.json"))) as {
      kind: string;
      liveAgents: boolean;
      usage: unknown;
      requests: { options: { sandboxMode: string }; proposal: unknown }[];
    };
    assert.equal(transport.kind, "deterministic-role-fixture");
    assert.equal(transport.liveAgents, false);
    assert.equal(transport.usage, null);
    assert.equal(transport.requests.length, attempts.length);
    for (const [index, attempt] of attempts.entries()) {
      const decision = (await json(
        resolve(runRoot, "planning", attempt, "policy-decision.json"),
      )) as { status: string; findings: { code: string }[] };
      assert.equal(decision.status, accepted ? "accepted" : "rejected");
      if (!accepted)
        assert(
          decision.findings.some(
            (finding) => finding.code === "PROTECTED_SCOPE",
          ),
        );
      assert.equal(transport.requests[index]?.options.sandboxMode, "read-only");
      const recordedProposal = await json(
        resolve(runRoot, "planning", attempt, "planner-proposal.json"),
      );
      assert.deepEqual(recordedProposal, transport.requests[index]?.proposal);
    }
    assert.equal(state.run.usage.codexInvocations, attempts.length);
    assert.equal(state.pendingOperation, null);
    assert.equal(state.activeMilestoneId, null);
    assert(
      state.milestones.every(
        (milestone) =>
          milestone.workerThreadId === null &&
          milestone.workspace === null &&
          milestone.attempts === 0,
      ),
    );
    assert.equal(state.queue.length, accepted ? 1 : 0);
    assert.equal(state.milestones.length, accepted ? 1 : 0);
    assert.equal(state.run.status, accepted ? "stopped" : "escalated");
    if (accepted) assert.equal(state.milestones[0]?.status, "ready");
    else {
      const escalation = await readFile(
        resolve(runRoot, "escalation-report.json"),
        "utf8",
      );
      assert.match(escalation, /"PLANNER_POLICY_LIMIT"/);
    }
    await readFile(resolve(runRoot, "run-summary.json"));
  }
}

export async function inspectPlanningProducer(
  input: TrustedQualificationInput,
): Promise<void> {
  const envelope = await validateQualificationInput(input);
  assert.deepEqual(envelope.binding.coverage, PLANNING_QUALIFICATION_CASES);
  await validateCommandReceiptDirectory({
    directory: input.directory,
    expectedStageId: PLANNING_QUALIFICATION_STAGE,
    expectedCommandId: PLANNING_PRODUCER_COMMAND,
    requiredKinds: [
      "planning-producer-report",
      "planning-workflow-observation",
    ],
  });
  const report = (await json(
    resolve(input.directory, "producer-report.json"),
  )) as {
    source: unknown;
    fixtureSha256: string;
    coverage: unknown;
    platform: string;
    transport: string;
    completion: unknown;
  };
  assert.deepEqual(report.source, input.binding.source);
  assert.equal(report.fixtureSha256, input.binding.fixtureSha256);
  assert.deepEqual(report.coverage, input.binding.coverage);
  assert.equal(report.platform, input.binding.platform);
  assert.equal(report.transport, "deterministic-role-fixture");
  assert.deepEqual(report.completion, { eligible: false });
  await inspectPlanningObservations(input.directory, input.binding.source);
  await validateQualificationInput(input);
}

async function consume(encoded: string): Promise<void> {
  const context = await evidenceContext(
    PLANNING_QUALIFICATION_STAGE,
    PLANNING_CONSUMER_COMMAND,
  );
  assert(encoded.length <= 16 * 1024);
  const expected = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as Omit<TrustedQualificationInput, "directory">;
  const input = { ...expected, directory: QUALIFICATION_INPUT_DESTINATION };
  await inspectPlanningProducer(input);
  let writeError: string | null = null;
  try {
    // No truncation of existing data even if the read-only policy regresses.
    await writeFile(
      resolve(QUALIFICATION_INPUT_DESTINATION, "write-probe"),
      "must fail",
      { flag: "wx" },
    );
  } catch (error) {
    writeError = (error as NodeJS.ErrnoException).code ?? null;
  }
  assert.equal(
    writeError,
    "EROFS",
    "The kernel must enforce the read-only input.",
  );
  await inspectPlanningProducer(input);
  await writeJson(resolve(context.artifactDirectory, "consumer-report.json"), {
    schemaVersion: "planning-consumer.v1",
    envelopeSha256: input.envelopeSha256,
    binding: input.binding,
    readOnlyWriteError: writeError,
    completion: { eligible: false },
  });
  await writeReceipt(
    context,
    [
      {
        id: "authenticated-planning-input",
        summary:
          "Validated both public planning cases, actual producer receipts and coordinator pins; the kernel rejected input writes.",
      },
    ],
    [{ path: "consumer-report.json", kind: "planning-consumer-report" }],
  );
}

export async function planningQualificationMain(
  argv: readonly string[],
): Promise<void> {
  if (argv.length === 1 && argv[0] === "produce") return produce();
  if (argv.length === 2 && argv[0] === "consume" && argv[1])
    return consume(argv[1]);
  throw new Error("Expected produce or consume <trusted-context-base64url>.");
}
