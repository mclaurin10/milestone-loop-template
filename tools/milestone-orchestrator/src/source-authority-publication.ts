import assert from "node:assert/strict";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AUTHORITY_MIGRATION_PENDING_PATH,
  SOURCE_AUTHORITY_PUBLICATION_PATH,
} from "./authority-publication.mjs";
import { AMENDMENT_PENDING_PATH } from "./commissioning-audit.js";
import { assertOrchestratorState } from "./schema.js";
import { GitStateGenerationStore } from "./state-generation-store.js";
import {
  ControllerLease,
  releaseLeaseWithoutMasking,
} from "./controller-lease.js";
import { ensureContainedDirectory } from "./path-safety.js";
import { exclusiveWriteSerialized } from "./state-store.js";
import { inspectCommittedSourceAuthorityRequestBinding } from "./source-authority-transition.js";
import {
  assertSourceReviewPermit,
  beginSourceReviewPublication,
  finishSourceReviewPublication,
  type SourceReviewPermit,
} from "./source-authority-review.js";
import {
  inspectSourceReviewEvidence,
  sourceCanonical,
  sourceExactKeys,
  sourceFilePin,
  sourceGit,
  sourceGitText,
  sourceHash,
  sourceIdentity,
  sourceRead,
} from "./source-authority-evidence.mjs";
import {
  inspectSourceOutputsAgainstRequest,
  inspectSourceRequestPrerequisites,
  SOURCE_GENERATION_PATHS,
  SOURCE_PUBLICATION_EVIDENCE_PREFIX,
} from "./source-authority-generation.mjs";
import {
  inspectSourceLeaseOwner,
  inspectSourcePreparedPublicationEvents,
  readSourcePreparedIntent,
} from "./source-authority-records.mjs";
import { retainSourcePublicationPacket } from "./source-authority-publication-receipt.js";

export const SOURCE_STATE_PATH = "artifacts/orchestrator/state/state.json";
export interface SourceMigrationRequestIdentity {
  readonly commit: string;
  readonly sha256: string;
}
export interface SourcePublicationHooks {
  readonly afterStaged?: () => Promise<void> | void;
  readonly beforeIntent?: () => Promise<void> | void;
  readonly afterIntentWrite?: () => Promise<void> | void;
  readonly afterIntent?: () => Promise<void> | void;
  readonly beforeReplace?: (path: string) => Promise<void> | void;
  readonly afterReplace?: (path: string) => Promise<void> | void;
  readonly beforeFinalization?: () => Promise<void> | void;
  readonly afterCompletionRecord?: () => Promise<void> | void;
  readonly afterFinalization?: () => Promise<void> | void;
  readonly beforeEvidenceFile?: (path: string) => Promise<void> | void;
  readonly afterEvidenceFile?: (path: string) => Promise<void> | void;
}
export async function observeSourceMigrationState(root: string) {
  const mirror = await sourceRead(root, SOURCE_STATE_PATH, true);
  // readCurrent validates the existing canonical generation and lineage. This
  // path never calls StateStore, createGeneration, publish, migration or repair.
  const current = new GitStateGenerationStore(root).readCurrent();
  const states = [
    current?.state,
    mirror === null
      ? null
      : assertOrchestratorState(JSON.parse(mirror.toString())),
  ].filter((value) => value !== null && value !== undefined);
  for (const state of states) {
    assert.equal(
      state.reconciliation.active,
      null,
      "Source publication refuses unresolved reconciliation.",
    );
    assert.equal(
      state.pendingOperation,
      null,
      "Source publication refuses a pending state operation.",
    );
    assert.equal(
      state.run.status,
      "idle",
      "Source publication refuses a running controller operation.",
    );
  }
  return {
    mirror: sourceFilePin(SOURCE_STATE_PATH, mirror),
    reference: "refs/milestone-loop/state",
    objectId: current?.objectId ?? null,
    stateSha256: current?.metadata.stateSha256 ?? null,
  };
}
export function sourceTransactionPaths(requestSha256: string) {
  assert(/^[a-f0-9]{64}$/.test(requestSha256));
  const directory = "artifacts/orchestrator/source-authority/" + requestSha256;
  return {
    directory,
    completedIntent: directory + "/completed-intent.json",
    events: directory + "/publication-events.jsonl",
    staged: directory + "/staged",
    reviews: directory + "/reviews",
  };
}
function stagedReviewPrefix(requestSha256: string, reviewSha256: string) {
  assert(/^[a-f0-9]{64}$/.test(reviewSha256));
  return (
    sourceTransactionPaths(requestSha256).reviews + "/" + reviewSha256 + "/"
  );
}
async function assertNoAmendment(root: string) {
  try {
    await lstat(resolve(root, AMENDMENT_PENDING_PATH));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(
    "Source publication refuses a pending commissioning amendment.",
  );
}
function sourceInvocationUnchanged(
  root: string,
  invocation: ReturnType<typeof sourceIdentity>,
) {
  assert.deepEqual(
    sourceIdentity(root),
    invocation,
    "Source publication HEAD/tree/branch changed.",
  );
  sourceGit(root, ["diff-index", "--cached", "--quiet", "HEAD", "--"]);
  const status = sourceGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ])
    .toString()
    .split("\0")
    .filter(Boolean);
  for (const row of status) {
    assert(
      row.length > 3 && (row[0] === " " || row.startsWith("?? ")),
      "Source publication refuses staged changes, renames or an invalid index state.",
    );
    const path = row.slice(3);
    assert(
      path === AUTHORITY_MIGRATION_PENDING_PATH ||
        SOURCE_GENERATION_PATHS.includes(path) ||
        path.startsWith(SOURCE_PUBLICATION_EVIDENCE_PREFIX),
      "Source publication refuses unrelated tracked or untracked changes: " +
        path,
    );
  }
}
function validateIntent(
  value: unknown,
  context: Awaited<ReturnType<typeof inspectSourceRequestPrerequisites>>,
) {
  sourceExactKeys(value, [
    "schemaVersion",
    "request",
    "invocation",
    "implementation",
    "reviewReceiptSha256",
    "implementationReceiptSha256",
    "state",
    "leaseAtCreation",
    "outputs",
  ]);
  const intent = value as {
    readonly schemaVersion: string;
    readonly request: {
      readonly commit: string;
      readonly sha256: string;
      readonly subjectSha256: string;
    };
    readonly invocation: ReturnType<typeof sourceIdentity>;
    readonly implementation: typeof context.binding.implementation;
    readonly reviewReceiptSha256: string;
    readonly implementationReceiptSha256: string;
    readonly state: Awaited<ReturnType<typeof observeSourceMigrationState>>;
    readonly leaseAtCreation: {
      readonly reference: string;
      readonly objectId: string;
    };
    readonly outputs: typeof context.request.outputs;
  };
  assert.equal(intent.schemaVersion, "source-authority-migration-intent.v1");
  assert.deepEqual(intent.request, {
    commit: context.binding.requestCommit,
    sha256: context.binding.requestSha256,
    subjectSha256: context.binding.subjectSha256,
  });
  sourceExactKeys(intent.invocation, ["commit", "tree", "branch"]);
  assert.deepEqual(intent.implementation, context.binding.implementation);
  assert.equal(intent.invocation.branch, context.binding.implementation.branch);
  assert(/^[a-f0-9]{64}$/.test(intent.reviewReceiptSha256));
  assert.equal(intent.implementationReceiptSha256, context.audit.sha256);
  assert.deepEqual(intent.outputs, context.request.outputs);
  sourceExactKeys(intent.state, [
    "mirror",
    "reference",
    "objectId",
    "stateSha256",
  ]);
  assert.deepEqual(intent.state.mirror, context.request.subject.canonicalState);
  assert.equal(intent.state.reference, "refs/milestone-loop/state");
  assert(
    intent.state.objectId === null
      ? intent.state.stateSha256 === null
      : /^[a-f0-9]{40}$/.test(intent.state.objectId) &&
          /^[a-f0-9]{64}$/.test(intent.state.stateSha256!),
  );
  sourceExactKeys(intent.leaseAtCreation, ["reference", "objectId"]);
  assert.equal(
    intent.leaseAtCreation.reference,
    "refs/milestone-loop/controller-lease",
  );
  assert(/^[a-f0-9]{40}$/.test(intent.leaseAtCreation.objectId));
  return intent;
}
export async function inspectSourcePublicationAdmission(
  root: string,
  expected: SourceMigrationRequestIdentity,
) {
  sourceExactKeys(expected, ["commit", "sha256"]);
  assert(
    /^[a-f0-9]{40}$/.test(expected.commit) &&
      /^[a-f0-9]{64}$/.test(expected.sha256),
  );
  await assertNoAmendment(root);
  const context = await inspectSourceRequestPrerequisites(root);
  assert.equal(
    context.binding.requestCommit,
    expected.commit,
    "Only the exact committed source request may acquire migration ownership.",
  );
  assert.equal(context.binding.requestSha256, expected.sha256);
  const paths = sourceTransactionPaths(expected.sha256);
  const pending = await sourceRead(
    root,
    AUTHORITY_MIGRATION_PENDING_PATH,
    true,
  );
  const completed = await sourceRead(root, paths.completedIntent, true);
  assert(
    !(pending && completed) || pending.equals(completed),
    "Source publication has conflicting pending and completed intents.",
  );
  const activeIntent = pending ?? completed;
  const preparedEvents =
    activeIntent === null ? await sourceRead(root, paths.events, true) : null;
  const raw =
    activeIntent ??
    (preparedEvents === null ? null : readSourcePreparedIntent(preparedEvents));
  const state = await observeSourceMigrationState(root);
  assert.deepEqual(
    state.mirror,
    context.request.subject.canonicalState,
    "Source state changed since the audited request.",
  );
  if (activeIntent === null) {
    const identity = sourceIdentity(root, true);
    assert.equal(identity.branch, context.binding.implementation.branch);
    for (const file of context.request.outputs)
      assert.deepEqual(
        sourceFilePin(file.path, await sourceRead(root, file.path, true)),
        file.prior,
        "Source publication prior file differs: " + file.path,
      );
    assert.equal(
      await sourceRead(root, SOURCE_AUTHORITY_PUBLICATION_PATH, true),
      null,
    );
    if (raw === null)
      return {
        context,
        paths,
        state,
        invocation: identity,
        intent: null,
        review: null,
        intentBytes: null,
        completed: false,
        pendingPresent: false,
      };
  }
  assert(raw !== null);
  const intent = validateIntent(JSON.parse(raw.toString()), context);
  if (preparedEvents !== null) {
    const owners = new Map();
    for (const line of preparedEvents.toString().trimEnd().split("\n")) {
      const row = JSON.parse(line);
      const id = row.lease?.objectId;
      assert(typeof id === "string" && /^[a-f0-9]{40}$/.test(id));
      const owner = await sourceRead(
        root,
        paths.directory + "/lease-owners/" + id + ".json",
      );
      owners.set(id, inspectSourceLeaseOwner(owner, id));
    }
    inspectSourcePreparedPublicationEvents(
      preparedEvents,
      {
        requestSha256: expected.sha256,
        intentSha256: sourceHash(raw),
        originalLease: intent.leaseAtCreation,
      },
      owners,
    );
  }
  const review = await inspectSourceReviewEvidence(
    root,
    context.binding,
    null,
    stagedReviewPrefix(expected.sha256, intent.reviewReceiptSha256),
  );
  assert.equal(
    review.sha256,
    intent.reviewReceiptSha256,
    "Original intent-bound source review changed.",
  );
  sourceInvocationUnchanged(root, intent.invocation);
  assert.deepEqual(
    state,
    intent.state,
    "Canonical source state changed during pending publication.",
  );
  for (const file of intent.outputs) {
    const actual = sourceFilePin(
      file.path,
      await sourceRead(root, file.path, true),
    );
    const next = { path: file.path, exists: true, ...file.next };
    assert(
      sourceCanonical(actual) === sourceCanonical(next) ||
        (!completed && sourceCanonical(actual) === sourceCanonical(file.prior)),
      "Foreign or incomplete source publication state: " + file.path,
    );
  }
  return {
    context,
    paths,
    state,
    invocation: intent.invocation,
    intent,
    review,
    intentBytes: raw,
    completed: completed !== null,
    pendingPresent: pending !== null,
  };
}

/** Dedicated admission for the existing CAS lease. A caller supplies only the
 * expected actual request identity, never an allowPending flag or file body. */
export async function assertSourceMigrationLeaseAdmission(
  root: string,
  expected: SourceMigrationRequestIdentity,
  permit: SourceReviewPermit,
) {
  await assertSourceReviewPermit(permit, root, expected);
  await inspectSourcePublicationAdmission(root, expected);
}

async function syncDirectory(path: string) {
  // Windows does not expose directory fsync through Node. Every file is
  // fsynced before its exclusive publication; supported directory handles are
  // also synced. Other errors remain fatal rather than being suppressed.
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      process.platform !== "win32" ||
      !["EPERM", "EACCES", "EINVAL", "EISDIR"].includes(code ?? "")
    )
      throw error;
  } finally {
    await handle?.close();
  }
}
async function durableExactFile(root: string, path: string, bytes: Buffer) {
  await ensureContainedDirectory(root, dirname(resolve(root, path)));
  const prior = await sourceRead(root, path, true);
  if (prior !== null) {
    assert(
      prior.equals(bytes),
      "Foreign source transaction artifact was preserved: " + path,
    );
    return;
  }
  const file = await open(resolve(root, path), "wx");
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  await syncDirectory(dirname(resolve(root, path)));
}
async function prerequisitePins(
  root: string,
  context: Awaited<ReturnType<typeof inspectSourceRequestPrerequisites>>,
  reviewPrefix: string,
  review: Awaited<ReturnType<typeof inspectSourceReviewEvidence>>,
) {
  const paths = new Set<string>([
    ".agent/authority-requests/ORCH-AUTH-01/request.json",
    ".agent/authority-requests/ORCH-AUTH-01/implementation-evidence/result.json",
    reviewPrefix + "result.json",
    ...context.request.subject.preserved.map(
      (pin: { path: string }) => pin.path,
    ),
    ...[...context.audit.artifacts.keys()].map(
      (path) =>
        ".agent/authority-requests/ORCH-AUTH-01/implementation-evidence/" +
        path,
    ),
    ...[...review.artifacts.keys()].map((path) => reviewPrefix + path),
  ]);
  return Promise.all(
    [...paths]
      .sort()
      .map(async (path) => sourceFilePin(path, await sourceRead(root, path))),
  );
}

/** Real existing-lease publisher. It changes only the exact twelve active
 * outputs and its owned transaction/evidence files. Committing the complete
 * generation and returned receipt is an explicit later operation. */
export async function publishSourceAuthority(input: {
  readonly repositoryRoot: string;
  readonly request: SourceMigrationRequestIdentity;
  readonly reviewPermit: SourceReviewPermit;
  readonly hooks?: SourcePublicationHooks;
}) {
  const liveReview = await beginSourceReviewPublication(
    input.reviewPermit,
    input.repositoryRoot,
    input.request,
  );
  try {
    return await publishReviewedSourceAuthority(input, liveReview);
  } finally {
    finishSourceReviewPublication(input.reviewPermit);
  }
}
async function publishReviewedSourceAuthority(
  input: {
    readonly repositoryRoot: string;
    readonly request: SourceMigrationRequestIdentity;
    readonly reviewPermit: SourceReviewPermit;
    readonly hooks?: SourcePublicationHooks;
  },
  liveReview: Awaited<ReturnType<typeof beginSourceReviewPublication>>,
) {
  const root = await realpath(input.repositoryRoot),
    hooks = input.hooks ?? {};
  // The original strict reconstruction rejects arbitrary manifest/output data
  // even before the native evidence/provenance admission and lease acquisition.
  const projection = await inspectCommittedSourceAuthorityRequestBinding({
    repositoryRoot: root,
  });
  assert.equal(projection.requestCommit, input.request.commit);
  assert.equal(projection.requestSha256, input.request.sha256);
  const admission = await inspectSourcePublicationAdmission(
    root,
    input.request,
  );
  const lease = await ControllerLease.acquire({
    repositoryRoot: root,
    statePath: SOURCE_STATE_PATH,
    operation: "authority-migrate",
    sourceAuthorityRequest: input.request,
    sourceReviewPermit: input.reviewPermit,
  });
  let failed = true;
  try {
    await lease.assertHeld();
    const current = await inspectSourcePublicationAdmission(
      root,
      input.request,
    );
    assert.deepEqual(current.invocation, admission.invocation);
    assert.deepEqual(current.state, admission.state);
    const { context, paths, invocation, state } = current;
    const heldOwner = lease.ownershipPin();
    const ownerBytes = sourceGit(root, [
      "cat-file",
      "blob",
      heldOwner.objectId,
    ]);
    inspectSourceLeaseOwner(ownerBytes, heldOwner.objectId);
    await durableExactFile(
      root,
      paths.directory + "/lease-owners/" + heldOwner.objectId + ".json",
      ownerBytes,
    );
    const originalReview = current.review ?? liveReview.evidence;
    const reviewPrefix = stagedReviewPrefix(
      input.request.sha256,
      originalReview.sha256,
    );
    // Preserve both the first intent-bound review and every fresh recovery
    // review in disjoint hash-named owned directories. None overwrites another.
    for (const evidence of [originalReview, liveReview.evidence]) {
      const prefix = stagedReviewPrefix(input.request.sha256, evidence.sha256);
      for (const [path, artifact] of evidence.artifacts)
        await durableExactFile(root, prefix + path, artifact.contents);
      await durableExactFile(root, prefix + "result.json", evidence.bytes);
      const checked = await inspectSourceReviewEvidence(
        root,
        context.binding,
        null,
        prefix,
      );
      assert.equal(checked.sha256, evidence.sha256);
    }
    const pins = await prerequisitePins(
      root,
      context,
      reviewPrefix,
      originalReview,
    );
    if (liveReview.evidence.sha256 !== originalReview.sha256) {
      const freshPrefix = stagedReviewPrefix(
        input.request.sha256,
        liveReview.evidence.sha256,
      );
      for (const path of [
        "result.json",
        ...liveReview.evidence.artifacts.keys(),
      ])
        pins.push(
          sourceFilePin(
            freshPrefix + path,
            await sourceRead(root, freshPrefix + path),
          ),
        );
    }
    const intent = current.intent ?? {
      schemaVersion: "source-authority-migration-intent.v1",
      request: {
        commit: input.request.commit,
        sha256: input.request.sha256,
        subjectSha256: context.binding.subjectSha256,
      },
      invocation,
      implementation: context.binding.implementation,
      reviewReceiptSha256: originalReview.sha256,
      implementationReceiptSha256: context.audit.sha256,
      state,
      leaseAtCreation: lease.ownershipPin(),
      outputs: context.request.outputs,
    };
    validateIntent(intent, context);
    const intentBytes =
      current.intentBytes ??
      Buffer.from(JSON.stringify(intent, null, 2) + "\n");
    const intentSha256 = sourceHash(intentBytes);
    await ensureContainedDirectory(root, resolve(root, paths.directory));
    let expectedTrace = await sourceRead(root, paths.events, true);
    const trace = async (event: string, path: string | null = null) => {
      const output = resolve(root, paths.events);
      const before = await sourceRead(root, paths.events, true);
      assert(
        sourceCanonical(sourceFilePin(paths.events, before)) ===
          sourceCanonical(sourceFilePin(paths.events, expectedTrace)),
        "Foreign publication event changes were preserved.",
      );
      const row = {
        observedAt: new Date().toISOString(),
        event,
        path,
        requestSha256: input.request.sha256,
        intentSha256,
        lease: lease.ownershipPin(),
        previousBytes: before?.length ?? 0,
        previousSha256: before === null ? null : sourceHash(before),
        ...(before === null
          ? { preparedIntent: intentBytes.toString("base64") }
          : {}),
      };
      const line = Buffer.from(JSON.stringify(row) + "\n");
      const handle = await open(output, before === null ? "wx" : "a");
      try {
        await handle.writeFile(line);
        await handle.sync();
      } finally {
        await handle.close();
      }
      expectedTrace = Buffer.concat([before ?? Buffer.alloc(0), line]);
    };
    const assertInputs = async (
      requireIntent: boolean,
      completedOnly = false,
    ) => {
      assert.equal(
        await realpath(root),
        root,
        "Source repository root was redirected.",
      );
      sourceInvocationUnchanged(root, invocation);
      await assertNoAmendment(root);
      assert.deepEqual(
        await observeSourceMigrationState(root),
        state,
        "Source canonical state changed during publication.",
      );
      await Promise.all(
        pins.map(async (pin) =>
          assert.deepEqual(
            sourceFilePin(pin.path, await sourceRead(root, pin.path)),
            pin,
            "Approved request/review/preserved input changed during publication: " +
              pin.path,
          ),
        ),
      );
      const pending = await sourceRead(
        root,
        AUTHORITY_MIGRATION_PENDING_PATH,
        true,
      );
      const complete = await sourceRead(root, paths.completedIntent, true);
      if (requireIntent)
        assert(
          (pending !== null && pending.equals(intentBytes)) ||
            (complete !== null && complete.equals(intentBytes)),
          "The exact durable source intent disappeared or changed.",
        );
      else
        assert(
          pending === null && complete === null,
          "A competing intent appeared before source publication.",
        );
      if (pending !== null)
        assert(
          pending.equals(intentBytes),
          "Foreign pending intent was preserved.",
        );
      if (complete !== null)
        assert(
          complete.equals(intentBytes),
          "Foreign completed intent was preserved.",
        );
      await Promise.all(
        context.request.outputs.map(
          async (
            file: Pick<
              (typeof projection.files)[number],
              "path" | "prior" | "next"
            >,
          ) => {
            const actual = sourceFilePin(
              file.path,
              await sourceRead(root, file.path, true),
            );
            const next = { path: file.path, exists: true, ...file.next };
            assert(
              requireIntent
                ? sourceCanonical(actual) === sourceCanonical(next) ||
                    (!completedOnly &&
                      sourceCanonical(actual) === sourceCanonical(file.prior))
                : sourceCanonical(actual) === sourceCanonical(file.prior),
              "Foreign active file was preserved during publication: " +
                file.path,
            );
          },
        ),
      );
    };
    const assertBoundary = async (
      requireIntent: boolean,
      completedOnly = false,
    ) => {
      await lease.assertHeld();
      await assertSourceReviewPermit(input.reviewPermit, root, input.request);
      await assertInputs(requireIntent, completedOnly);
      await lease.assertHeld();
    };
    await trace("attempt-start");
    if (!current.completed) {
      for (const file of projection.files) {
        const staged = paths.staged + "/" + file.path;
        await durableExactFile(root, staged, file.contents);
        assert.equal(
          (await lstat(resolve(root, staged))).dev,
          (await lstat(root)).dev,
          "Source staging and publication require the same filesystem.",
        );
      }
      await hooks.afterStaged?.();
      await assertBoundary(current.pendingPresent || current.completed);
      for (const file of projection.files)
        assert(
          (await sourceRead(root, paths.staged + "/" + file.path))!.equals(
            file.contents,
          ),
          "Source staging changed before durable intent publication.",
        );
      if (!current.pendingPresent && !current.completed) {
        await hooks.beforeIntent?.();
        await assertBoundary(false);
        await ensureContainedDirectory(root, resolve(root, ".agent"));
        assert.equal(
          await exclusiveWriteSerialized(
            resolve(root, AUTHORITY_MIGRATION_PENDING_PATH),
            intentBytes.toString(),
          ),
          "created",
          "A competing source intent was preserved.",
        );
        await syncDirectory(resolve(root, ".agent"));
        await hooks.afterIntentWrite?.();
      }
      // Recovery can observe the exact exclusive intent after a crash before
      // its append observation. Retain that observed fact once under this lease.
      const recordedIntent = expectedTrace!
        .toString()
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((row) =>
          ["intent-published", "intent-observed-durable"].includes(row.event),
        );
      assert(
        recordedIntent.length <= 1,
        "Duplicate source intent publication events.",
      );
      if (recordedIntent.length === 0) {
        await assertBoundary(true);
        await trace(
          current.pendingPresent
            ? "intent-observed-durable"
            : "intent-published",
        );
      }
      if (!current.pendingPresent && !current.completed)
        await hooks.afterIntent?.();
      await assertBoundary(true);
      for (const file of projection.files) {
        const live = await sourceRead(root, file.path, true);
        if (
          live !== null &&
          sourceHash(live) === file.next.sha256 &&
          live.length === file.next.bytes
        ) {
          await trace("exact-output-already-present", file.path);
          continue;
        }
        await hooks.beforeReplace?.(file.path);
        await assertBoundary(true);
        const staged = paths.staged + "/" + file.path;
        assert(
          (await sourceRead(root, staged))!.equals(file.contents),
          "Staged source file differs from the audited output.",
        );
        const target = resolve(root, file.path);
        // Top-level approved authority files already have the canonical
        // repository as their parent. The directory creator accepts strict
        // descendants only; it must never be asked to create the root itself.
        if (dirname(target) !== root)
          await ensureContainedDirectory(root, dirname(target));
        await trace("before-replace", file.path);
        await assertBoundary(true);
        await rename(resolve(root, staged), target);
        await syncDirectory(dirname(target));
        await trace("after-replace", file.path);
        await hooks.afterReplace?.(file.path);
        await assertBoundary(true);
      }
    }
    await assertBoundary(true, true);
    await inspectSourceOutputsAgainstRequest(root, context);
    await hooks.beforeFinalization?.();
    await assertBoundary(true, true);
    const completion = await exclusiveWriteSerialized(
      resolve(root, paths.completedIntent),
      intentBytes.toString(),
    );
    if (completion === "exists")
      assert(
        (await sourceRead(root, paths.completedIntent))!.equals(intentBytes),
        "Foreign completed source intent was preserved.",
      );
    await syncDirectory(resolve(root, paths.directory));
    await trace("completion-recorded");
    await hooks.afterCompletionRecord?.();
    await assertBoundary(true, true);
    const pending = await sourceRead(
      root,
      AUTHORITY_MIGRATION_PENDING_PATH,
      true,
    );
    if (pending !== null) {
      assert(pending.equals(intentBytes));
      await lease.assertHeld();
      await unlink(resolve(root, AUTHORITY_MIGRATION_PENDING_PATH));
      await syncDirectory(resolve(root, ".agent"));
    }
    await trace("publication-finalized");
    await hooks.afterFinalization?.();
    await assertBoundary(true, true);
    assert.equal(
      await sourceRead(root, AUTHORITY_MIGRATION_PENDING_PATH, true),
      null,
    );
    assert.equal(sourceGitText(root, "rev-parse", "HEAD"), invocation.commit);
    const result = {
      schemaVersion: "source-authority-publication-result.v1",
      status: "PASS",
      completionEligible: false,
      commitRequired: true,
      resumed: current.intent !== null,
      request: intent.request,
      implementation: intent.implementation,
      invocation,
      reviewReceiptSha256: intent.reviewReceiptSha256,
      freshReviewReceiptSha256: liveReview.evidence.sha256,
      freshReview: liveReview.evidence.report.reviewer,
      executingSourceSha256: liveReview.executingSourceSha256,
      implementationReceiptSha256: intent.implementationReceiptSha256,
      intentSha256,
      state,
      outputs: context.request.outputs,
      lease: lease.ownershipPin(),
      completedIntentPath: paths.completedIntent,
      eventLogPath: paths.events,
    };
    const eventBytes = (await sourceRead(root, paths.events))!;
    assert(
      eventBytes.equals(expectedTrace!),
      "Publication event bytes changed after finalization.",
    );
    const publication = {
      result,
      intentBytes,
      eventBytes,
      review: originalReview,
      freshReview: liveReview.evidence,
      files: projection.files,
    };
    const receipt = await retainSourcePublicationPacket({
      root,
      context,
      publication,
      lease,
      permit: input.reviewPermit,
      assertInputs: () => assertInputs(true, true),
      hooks,
    });
    await assertBoundary(true, true);
    failed = false;
    return { ...publication, receipt };
  } finally {
    await releaseLeaseWithoutMasking(() => lease.release(), failed);
  }
}
