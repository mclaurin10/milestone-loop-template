import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import {
  evidenceContext,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";
import { SdkCodexGateway } from "./codex-gateway.js";
import { loadConfig } from "./config.js";
import { SOURCE_AUTHORITY_REQUEST_PATH } from "./authority-publication.mjs";
import { inspectSourceAuthorityRequestForReview } from "./source-authority-transition.js";
import {
  SOURCE_GENERATION_PATHS,
  inspectSourceRequestPrerequisites,
} from "./source-authority-generation.mjs";
import {
  inspectSourceReviewEvidence,
  sourceCanonical,
  sourceGit,
  sourceGitText,
  sourceHash,
  sourceIdentity,
  sourceRead,
  sourceReviewOutputSchema,
  assertSourceReviewDecision,
  SOURCE_REVIEW_CHECK_IDS,
} from "./source-authority-evidence.mjs";
import { validateCommandReceiptDirectory } from "./verifier.js";

const controllerRoot = resolve(import.meta.dirname, "../../..");
const codePolicyPath = "tools/source-release-policy.json";
const codeCapture = (async () => {
  const root = await realpath(controllerRoot);
  const policyBytes = (await sourceRead(root, codePolicyPath))!;
  const policy = JSON.parse(policyBytes.toString());
  assert.equal(policy.schemaVersion, "source-release-policy.v1");
  assert(Array.isArray(policy.payloadFiles));
  assert(
    policy.payloadFiles.includes(
      "tools/milestone-orchestrator/src/source-authority-review.ts",
    ),
  );
  const paths: string[] = [
    ...new Set<string>([
      codePolicyPath,
      ...policy.payloadFiles.filter(
        (path: string) => !SOURCE_GENERATION_PATHS.includes(path),
      ),
    ]),
  ].sort();
  const files = await Promise.all(
    paths.map(async (path) => {
      const bytes = (await sourceRead(root, path))!;
      // This source tree declares text=auto eol=lf. Keep the exact loaded
      // bytes pinned below, while comparing text's LF Git object identity.
      // No candidate-configured clean filter or external transform executes.
      const text = bytes.toString("utf8");
      assert(
        Buffer.from(text, "utf8").equals(bytes) && !bytes.includes(0),
        "Controller code identity expects UTF-8 source text: " + path,
      );
      const gitBytes = Buffer.from(text.replaceAll("\r\n", "\n"));
      return Object.freeze({
        path,
        bytes: bytes.length,
        sha256: sourceHash(bytes),
        gitBlob: createHash("sha1")
          .update(`blob ${gitBytes.length}\0`)
          .update(gitBytes)
          .digest("hex"),
      });
    }),
  );
  return Object.freeze({
    root,
    files: Object.freeze(files),
    sha256: sourceHash(Buffer.from(sourceCanonical(files) + "\n")),
  });
})();

/** Captured when this trusted controller module loads, then compared with real
 * implementation Git blobs and current controller bytes. A target's HEAD or
 * self-authored implementation identity alone does not identify executing code. */
export async function assertExecutingSourceImplementation(
  root: string,
  commit: string,
) {
  const captured = await codeCapture;
  assert(/^[a-f0-9]{40}$/.test(commit));
  const entries = new Map<string, string>(
    sourceGit(root, ["ls-tree", "-r", "-z", "--full-tree", commit])
      .toString()
      .split("\0")
      .filter(Boolean)
      .map((row: string) => {
        const [header, path] = row.split("\t");
        return [path!, header!];
      }),
  );
  await Promise.all(
    captured.files.map(async (file) => {
      assert.equal(
        entries.get(file.path),
        "100644 blob " + file.gitBlob,
        "Executing source differs from the audited implementation: " +
          file.path,
      );
      const current = (await sourceRead(captured.root, file.path))!;
      assert.equal(current.length, file.bytes);
      assert.equal(
        sourceHash(current),
        file.sha256,
        "Executing controller files changed after module loading: " + file.path,
      );
    }),
  );
  return captured.sha256;
}

declare const permitBrand: unique symbol;
export type SourceReviewPermit = { readonly [permitBrand]: true };
type ReviewEvidence = Awaited<ReturnType<typeof inspectSourceReviewEvidence>>;
interface PermitRecord {
  readonly binding: Awaited<
    ReturnType<typeof inspectSourceRequestPrerequisites>
  >["binding"];
  readonly root: string;
  readonly request: { readonly commit: string; readonly sha256: string };
  readonly implementationCommit: string;
  readonly executingSourceSha256: string;
  readonly evidencePrefix: string;
  readonly evidence: ReviewEvidence;
  phase: "reviewed" | "publishing" | "spent";
}
const permits = new WeakMap<object, PermitRecord>();
export async function assertSourceReviewPermit(
  permit: SourceReviewPermit,
  root: string,
  request: { readonly commit: string; readonly sha256: string },
) {
  const record = permits.get(permit);
  assert(
    record && record.phase !== "spent",
    "Source publication requires a live permit issued by the actual independent SDK review.",
  );
  assert.equal(await realpath(root), record.root);
  assert.deepEqual(request, record.request);
  assert.equal(
    await assertExecutingSourceImplementation(
      root,
      record.implementationCommit,
    ),
    record.executingSourceSha256,
  );
  const current = await inspectSourceReviewEvidence(
    controllerRoot,
    record.binding,
    null,
    record.evidencePrefix,
  );
  assert.equal(
    current.sha256,
    record.evidence.sha256,
    "Live independent review evidence changed.",
  );
  return {
    request: { ...record.request },
    executingSourceSha256: record.executingSourceSha256,
    evidencePrefix: record.evidencePrefix,
    evidence: current,
  };
}
export async function beginSourceReviewPublication(
  permit: SourceReviewPermit,
  root: string,
  request: { readonly commit: string; readonly sha256: string },
) {
  const evidence = await assertSourceReviewPermit(permit, root, request);
  const record = permits.get(permit)!;
  assert.equal(
    record.phase,
    "reviewed",
    "A source review permit cannot start concurrent or repeated publication attempts.",
  );
  record.phase = "publishing";
  return evidence;
}
export function finishSourceReviewPublication(permit: SourceReviewPermit) {
  const record = permits.get(permit);
  assert(record && record.phase === "publishing");
  record.phase = "spent";
}

/** A fresh owned clean view of a real existing commit. Only the object database
 * is shared read-only; no controller state, refs, credentials or worktree edits
 * are copied. Recovery can review the request without reading mixed live roots. */
async function requestView<T>(
  root: string,
  commit: string,
  branch: string,
  run: (view: string) => Promise<T>,
): Promise<T> {
  const parent = await realpath(tmpdir());
  const view = await realpath(
    await mkdtemp(resolve(parent, "source-review-git-view-")),
  );
  try {
    sourceGit(view, ["init", "--quiet", "--initial-branch", branch]);
    await mkdir(resolve(view, ".git/objects/info"), { recursive: true });
    await writeFile(
      resolve(view, ".git/objects/info/alternates"),
      sourceGitText(
        root,
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "objects",
      ).replaceAll("\\", "/") + "\n",
      { flag: "wx" },
    );
    sourceGit(view, [
      "update-ref",
      "refs/heads/" + branch,
      commit,
      "0".repeat(40),
    ]);
    sourceGit(view, ["read-tree", commit]);
    sourceGit(view, ["checkout-index", "--all"]);
    const identity = sourceIdentity(view, true);
    const result = await run(view);
    assert.deepEqual(
      sourceIdentity(view, true),
      identity,
      "The independent read-only reviewer changed its request view.",
    );
    return result;
  } finally {
    assert.equal(dirname(view), parent);
    assert(basename(view).startsWith("source-review-git-view-"));
    assert.equal(await realpath(view), view);
    await rm(view, { recursive: true, force: true });
  }
}

/** No candidate argument can supply a gateway, schema, thread, prompt or
 * decision. The private permit is minted only after this actual SDK call and
 * independent transcript validation. Serialized review records mint nothing. */
export async function reviewSourceAuthorityRequest(input: {
  readonly artifactDirectory: string;
  readonly repositoryRoot?: string;
}) {
  const root = await realpath(input.repositoryRoot ?? controllerRoot),
    absolute = resolve(input.artifactDirectory);
  const evidencePrefix =
    relative(await realpath(controllerRoot), absolute).replaceAll("\\", "/") +
    "/";
  assert(
    evidencePrefix.startsWith("artifacts/") &&
      !evidencePrefix.split("/").includes("..") &&
      !existsSync(absolute),
    "Source review requires fresh controller-owned artifacts.",
  );
  process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = absolute;
  const context = await evidenceContext(
    "source-authority-review",
    "source-authority-review",
  );
  try {
    const prerequisites = await inspectSourceRequestPrerequisites(root);
    const { binding } = prerequisites;
    const executingSourceSha256 = await assertExecutingSourceImplementation(
      root,
      binding.implementation.commit,
    );
    const identity = sourceIdentity(root);
    const prompt = [
      "You are the fresh independent read-only reviewer of the approved ORCH-AUTH-01 r2 source authority migration. You did not implement it. Do not modify any file, ref, state, approval or artifact.",
      `Review actual request commit ${binding.requestCommit}, request SHA256 ${binding.requestSha256}, subject SHA256 ${binding.subjectSha256}, implementation commit ${binding.implementation.commit}, tree ${binding.implementation.tree}.`,
      "Read PROJECT_GOAL.md, AGENTS.md, .agent/current-exec-plan.md, docs/proposals/ORCH-AUTH-01-r2/TRANSITION-CONTRACT.md, the exact settled approval and inert snapshots, actual implementation Git diffs, the separately committed request and every implementation audit receipt/raw report under .agent/authority-requests/ORCH-AUTH-01/implementation-evidence/. Inspect the proposed twelve-file generation and preserved old commissioning/amendment history. Do not trust prose or a status flag as evidence.",
      "Assess actual native-compatible consumers, source/adopter scope separation, missing-stage refusal, exact source command floors, the existing mutation lease and held-owner checks, fsynced exclusive intent, every before/after publication fault, concurrency/recovery/foreign-file preservation, old-state fencing and absence of implicit commit/reset/adoption. Approval alone cannot activate source authority. Any missing required evidence, failed check, high/critical finding or weakened boundary must reject or escalate.",
      "Return only the structured result. Include every check exactly once with concrete evidence: " +
        SOURCE_REVIEW_CHECK_IDS.join(", ") +
        ". Candidate and migration evidence cannot establish readiness, human acceptance, historical WP6e completion or a WP6f interpretation.",
    ].join("\n\n");
    await writeFile(resolve(absolute, "reviewer-prompt.txt"), prompt + "\n", {
      flag: "wx",
    });
    const turn = await requestView(
      root,
      binding.requestCommit,
      binding.implementation.branch,
      async (view) => {
        const inspection = await inspectSourceAuthorityRequestForReview({
          repositoryRoot: view,
        });
        assert.equal(inspection.requestSha256, binding.requestSha256);
        const config = await loadConfig(view);
        assert.equal(config.reviewerSandbox, "read-only");
        return new SdkCodexGateway(config).run({
          role: "reviewer",
          prompt,
          workingDirectory: view,
          threadId: null,
          outputSchema: sourceReviewOutputSchema(binding),
          eventLogPath: resolve(absolute, "reviewer-events.jsonl"),
          timeoutMs: 30 * 60 * 1000,
          attempt: 1,
          escalationReason: null,
          telemetryPhase: "review",
        });
      },
    );
    const review = JSON.parse(turn.finalResponse),
      invocation = JSON.parse(
        await readFile(resolve(absolute, "agent-invocation.json"), "utf8"),
      );
    await writeFile(
      resolve(absolute, "review.json"),
      JSON.stringify(
        {
          schemaVersion: "source-authority-review.v1",
          completionEligible: false,
          request: {
            commit: binding.requestCommit,
            sha256: binding.requestSha256,
            subjectSha256: binding.subjectSha256,
          },
          implementation: binding.implementation,
          review,
          reviewer: {
            gateway: "SdkCodexGateway",
            threadId: turn.threadId,
            invocationId: invocation.id,
          },
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    assertSourceReviewDecision(review, binding);
    assert.equal(invocation.threadId, turn.threadId);
    assert.deepEqual(sourceIdentity(root), identity);
    assert.equal(
      sourceHash(await sourceRead(root, SOURCE_AUTHORITY_REQUEST_PATH)),
      binding.requestSha256,
    );
    assert.equal(
      await assertExecutingSourceImplementation(
        root,
        binding.implementation.commit,
      ),
      executingSourceSha256,
    );
    await writeReceipt(
      context,
      [
        {
          id: "independent-source-request-review",
          summary:
            "A fresh actual read-only SDK reviewer approved the exact committed request in its owned clean Git view. Raw events and invocation are retained; this is not publication or readiness.",
        },
      ],
      [
        { path: "review.json", kind: "source-authority-review" },
        {
          path: "reviewer-events.jsonl",
          kind: "source-authority-reviewer-events",
        },
        {
          path: "agent-invocation.json",
          kind: "source-authority-reviewer-invocation",
        },
        { path: "reviewer-prompt.txt", kind: "source-authority-review-prompt" },
      ],
    );
    const evidence = await inspectSourceReviewEvidence(
      controllerRoot,
      binding,
      null,
      evidencePrefix,
    );
    const receipt = await validateCommandReceiptDirectory({
      directory: absolute,
      expectedStageId: context.stageId,
      expectedCommandId: context.commandId,
      requiredKinds: [
        "source-authority-review",
        "source-authority-reviewer-events",
      ],
    });
    const permit = Object.freeze(Object.create(null)) as SourceReviewPermit;
    permits.set(permit, {
      binding: structuredClone(binding),
      root,
      request: { commit: binding.requestCommit, sha256: binding.requestSha256 },
      implementationCommit: binding.implementation.commit,
      executingSourceSha256,
      evidencePrefix,
      evidence,
      phase: "reviewed",
    });
    return { permit, receipt, binding };
  } catch (error) {
    await writeManualEvidenceFailure(context, {
      kind: "product",
      message: String(error),
    });
    throw error;
  }
}
