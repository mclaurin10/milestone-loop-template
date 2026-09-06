import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  assertActiveAuthorityPublication,
  SOURCE_AUTHORITY_PUBLICATION_PATH,
  SOURCE_AUTHORITY_REQUEST_PATH,
} from "./authority-publication.mjs";
import { inspectSourceAmendmentAudit } from "./commissioning-audit.js";
import {
  assertCommissioningInput,
  manifestFromInput,
} from "./commissioning.js";
import { canonicalJson } from "./package-graph.js";
import { assertVerificationScopePolicy } from "./schema.js";
import { INVARIANT_COMMAND, PARTITION_COMMANDS } from "./source-schedule.js";
import {
  inspectSourceEpochSnapshot,
  LEGACY_AUTHORITY_BASE,
  LEGACY_SNAPSHOT_ROOT_FILES,
  SOURCE_APPROVED_DIGEST,
  SOURCE_APPROVAL_PATH,
  SOURCE_APPROVAL_SHA256,
  SOURCE_CONTRACT_ID,
  SOURCE_EPOCH,
  SOURCE_SNAPSHOT_PREFIX,
  SOURCE_SNAPSHOT_ROOT_FILES,
} from "./source-epoch-snapshot.js";
import type { FocusedVerificationCommand } from "./contracts.js";

export const SOURCE_TRANSITION_SCOPE_POLICY_ID =
  "milestone-loop-source-scope-policy.v1";
export const SOURCE_TRANSITION_INPUT_PATH =
  "tools/milestone-orchestrator/config/source-commissioning-input.json";
export const SOURCE_TRANSITION_POLICY_PATH =
  "tools/milestone-orchestrator/config/verification-scope-policy.json";
export const SOURCE_TRANSITION_MANIFEST_PATH =
  ".agent/verification-manifest.json";
export const LEGACY_AMENDMENT_LEDGER_PATH =
  ".agent/completed/verification-manifest-amendments.json";
export const SOURCE_IMPLEMENTATION_EVIDENCE_PATH =
  ".agent/authority-requests/ORCH-AUTH-01/implementation-evidence/result.json";
export const SOURCE_TRANSITION_OUTPUT_PATHS = Object.freeze(
  [
    ...SOURCE_SNAPSHOT_ROOT_FILES,
    "package.json",
    SOURCE_TRANSITION_INPUT_PATH,
    SOURCE_TRANSITION_POLICY_PATH,
    SOURCE_TRANSITION_MANIFEST_PATH,
    SOURCE_AUTHORITY_PUBLICATION_PATH,
  ].sort(),
);
const PROTECTED_UNCHANGED_PATHS = [
  SOURCE_APPROVAL_PATH,
  LEGACY_AMENDMENT_LEDGER_PATH,
  ".agent/completed/loop-recommissioning-verification.json",
  ".agent/readiness-profile-activated.json",
  ".github/workflows/exact-runtime-ci.yml",
  "pnpm-lock.yaml",
  "scripts/verify.mjs",
  "tools/milestone-orchestrator/config/default.json",
  "tools/milestone-orchestrator/config/invariant-suite.json",
].sort();
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const bytes = (value: unknown) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n");
function git(root: string, args: string[]): Buffer {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: null,
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr.toString());
  return result.stdout;
}
const text = (root: string, ...args: string[]) =>
  git(root, args).toString("utf8").trim();
function exactCommit(root: string, commit: string) {
  assert(
    /^[a-f0-9]{40}$/.test(commit),
    "An exact actual Git commit is required.",
  );
  assert.equal(text(root, "rev-parse", `${commit}^{commit}`), commit);
}
function cleanIdentity(root: string) {
  const commit = text(root, "rev-parse", "HEAD");
  exactCommit(root, commit);
  const branch = text(root, "symbolic-ref", "--short", "HEAD");
  assert(branch, "Transition inspection requires an attached branch.");
  assert.equal(
    text(root, "status", "--porcelain=v1", "--untracked-files=all"),
    "",
    "Transition inspection requires a clean committed checkout.",
  );
  const tree = text(root, "rev-parse", "HEAD^{tree}");
  git(root, ["diff-index", "--cached", "--quiet", "HEAD", "--"]);
  return { commit, tree, branch };
}
async function ordinary(root: string, path: string): Promise<Buffer | null> {
  const absolute = resolve(root, path);
  try {
    const info = await lstat(absolute);
    assert(
      info.isFile() && !info.isSymbolicLink() && info.size <= 20_000_000,
      `Transition input must be bounded and regular: ${path}`,
    );
    assert.equal(
      await realpath(absolute),
      absolute,
      `Transition input is redirected: ${path}`,
    );
    return await readFile(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function committedOrdinary(root: string, commit: string, path: string) {
  const live = await ordinary(root, path);
  assert(live !== null, `Required transition input is absent: ${path}`);
  const entry = text(root, "ls-tree", commit, "--", path);
  assert(
    /^100644 blob [a-f0-9]{40}\t/.test(entry) && entry.endsWith("\t" + path),
    `Transition input is not one committed regular file: ${path}`,
  );
  assert(
    live.equals(git(root, ["show", `${commit}:${path}`])),
    `Transition input differs from its actual commit: ${path}`,
  );
  return live;
}
function pin(path: string, value: Buffer | null) {
  return value === null
    ? { path, exists: false as const, bytes: 0, sha256: null }
    : { path, exists: true as const, bytes: value.length, sha256: hash(value) };
}
export const SOURCE_TRANSITION_COMMANDS: readonly FocusedVerificationCommand[] =
  [
    INVARIANT_COMMAND,
    {
      id: "dependencies",
      argv: ["pnpm", "verify:source-dependencies"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["source-dependencies-report"],
    },
    {
      id: "format-check",
      argv: ["pnpm", "format:check"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["format-report"],
    },
    {
      id: "lint",
      argv: ["pnpm", "lint"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["lint-report"],
    },
    {
      id: "lint-architecture",
      argv: ["pnpm", "lint:source-architecture"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["source-architecture-report"],
    },
    {
      id: "typecheck",
      argv: ["pnpm", "typecheck"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["typecheck-report"],
    },
    {
      id: "build",
      argv: ["pnpm", "build"],
      tiers: ["candidate", "milestone"],
      expectedArtifactKinds: ["build-report"],
    },
    ...PARTITION_COMMANDS,
  ];

export interface SourceTransitionFile {
  readonly path: string;
  readonly prior: ReturnType<typeof pin>;
  readonly next: { readonly bytes: number; readonly sha256: string };
  readonly contents: Buffer;
}

/** Constructs exact reviewable bytes; it never writes authority, a request,
 * an intent, a lease or controller state. Inspection is not authorization. */
async function prepareTransition(
  input: {
    readonly repositoryRoot: string;
    readonly snapshotCommit: string;
  },
  recordedState?: ReturnType<typeof pin>,
) {
  const root = await realpath(input.repositoryRoot);
  assert.equal(await assertActiveAuthorityPublication(root), "legacy");
  const identity = cleanIdentity(root);
  assert.equal(
    await ordinary(root, SOURCE_AUTHORITY_PUBLICATION_PATH),
    null,
    "An existing epoch must not be replaced.",
  );
  const snapshot = await inspectSourceEpochSnapshot({
    repositoryRoot: root,
    snapshotCommit: input.snapshotCommit,
  });
  assert(
    snapshot.strictAncestor,
    "The approved inert snapshot must be a strict ancestor.",
  );
  const audit = await inspectSourceAmendmentAudit(root);
  assert(
    audit.ledger && audit.ledgerText,
    "The complete existing source amendment ledger is required.",
  );
  const prior = new Map<string, Buffer | null>();
  for (const path of SOURCE_TRANSITION_OUTPUT_PATHS)
    prior.set(
      path,
      path === SOURCE_AUTHORITY_PUBLICATION_PATH
        ? null
        : await committedOrdinary(root, identity.commit, path),
    );
  for (const path of LEGACY_SNAPSHOT_ROOT_FILES)
    assert(
      prior
        .get(path)
        ?.equals(git(root, ["show", `${LEGACY_AUTHORITY_BASE}:${path}`])),
      `Original legacy authority differs before transition: ${path}`,
    );
  const preserved = await Promise.all(
    PROTECTED_UNCHANGED_PATHS.map(async (path) =>
      pin(path, await committedOrdinary(root, identity.commit, path)),
    ),
  );
  assert.equal(
    preserved.find((value) => value.path === SOURCE_APPROVAL_PATH)?.sha256,
    SOURCE_APPROVAL_SHA256,
  );
  assert.equal(
    hash(Buffer.from(audit.ledgerText)),
    preserved.find((value) => value.path === LEGACY_AMENDMENT_LEDGER_PATH)
      ?.sha256,
  );
  const canonicalState =
    recordedState ??
    pin(
      "artifacts/orchestrator/state/state.json",
      await ordinary(root, "artifacts/orchestrator/state/state.json"),
    );
  const ledgerHistory = text(
    root,
    "log",
    "--reverse",
    "--format=%H",
    identity.commit,
    "--",
    LEGACY_AMENDMENT_LEDGER_PATH,
  )
    .split("\n")
    .filter(Boolean)
    .map((commit) => ({
      commit,
      sha256: hash(
        git(root, ["show", `${commit}:${LEGACY_AMENDMENT_LEDGER_PATH}`]),
      ),
    }));
  assert(ledgerHistory.length > 0);
  const subject = {
    schemaVersion: "source-authority-request-subject.v1",
    requestId: "ORCH-AUTH-01",
    authorityEpoch: SOURCE_EPOCH,
    contractId: SOURCE_CONTRACT_ID,
    approvedContentDigest: SOURCE_APPROVED_DIGEST,
    approvalRecordSha256: SOURCE_APPROVAL_SHA256,
    implementation: identity,
    snapshotCommit: snapshot.snapshotCommit,
    legacyAuthorityBase: LEGACY_AUTHORITY_BASE,
    legacyCommissioning: {
      anchor: audit.anchor,
      ledgerSha256: hash(Buffer.from(audit.ledgerText)),
      entryCount: audit.ledger.entries.length,
      ledgerHistory,
    },
    canonicalState,
    preserved,
    prior: SOURCE_TRANSITION_OUTPUT_PATHS.map((path) =>
      pin(path, prior.get(path) ?? null),
    ),
  };
  const subjectSha256 = hash(Buffer.from(canonicalJson(subject) + "\n"));
  const next = new Map<string, Buffer>();
  for (const path of SOURCE_SNAPSHOT_ROOT_FILES) {
    const contents = git(root, [
      "show",
      `${snapshot.snapshotCommit}:${SOURCE_SNAPSHOT_PREFIX}/${path}`,
    ]);
    assert.equal(
      hash(contents),
      snapshot.files.find(
        (file) => file.epoch === "source" && file.rootPath === path,
      )?.sha256,
    );
    next.set(path, contents);
  }
  const pkg = JSON.parse(prior.get("package.json")!.toString("utf8"));
  const originalScripts = canonicalJson(pkg.scripts);
  assert.equal(pkg.milestoneLoop.verification.defaultProfile, "readiness");
  assert.equal(pkg.milestoneLoop.verification.contractId, undefined);
  pkg.milestoneLoop.verification.contractId = SOURCE_CONTRACT_ID;
  assert.equal(canonicalJson(pkg.scripts), originalScripts);
  next.set("package.json", bytes(pkg));
  const oldPolicy = assertVerificationScopePolicy(
    JSON.parse(prior.get(SOURCE_TRANSITION_POLICY_PATH)!.toString("utf8")),
  );
  const floor = SOURCE_TRANSITION_COMMANDS.map((command) => command.id);
  const policy = assertVerificationScopePolicy({
    ...oldPolicy,
    id: SOURCE_TRANSITION_SCOPE_POLICY_ID,
    mandatoryChecks: Object.fromEntries(
      oldPolicy.triggerClasses.map((trigger) => [trigger, [...floor]]),
    ),
    workspaceChecks: Object.fromEntries(
      Object.keys(oldPolicy.workspaceChecks).map((workspace) => [
        workspace,
        [...floor],
      ]),
    ),
  });
  next.set(SOURCE_TRANSITION_POLICY_PATH, bytes(policy));
  const oldInput = assertCommissioningInput(
    JSON.parse(prior.get(SOURCE_TRANSITION_INPUT_PATH)!.toString("utf8")),
  );
  const commissioning = assertCommissioningInput({
    ...oldInput,
    commissioning: {
      ...oldInput.commissioning,
      id: SOURCE_CONTRACT_ID,
      baseCommit: snapshot.snapshotCommit,
      profile: "readiness",
    },
    sources: {
      ...oldInput.sources,
      immutableContractLockSha256: hash(
        next.get("evals/immutable-contract-lock.json")!,
      ),
    },
    objective:
      "Verify the orchestrator/template source under the approved orch-template.v1 authority and separate source, candidate and adopter claims.",
    exclusions: [
      "Candidate supporting evidence cannot establish source or adopter readiness.",
      "No historical WP6 reinterpretation, product implementation, scope suppression or controller-state adoption.",
    ],
    focusedCommands: SOURCE_TRANSITION_COMMANDS,
    scopePolicyId: SOURCE_TRANSITION_SCOPE_POLICY_ID,
  });
  next.set(SOURCE_TRANSITION_INPUT_PATH, bytes(commissioning));
  const timestamp = text(root, "show", "-s", "--format=%cI", identity.commit);
  assert(Number.isFinite(Date.parse(timestamp)));
  next.set(
    SOURCE_TRANSITION_MANIFEST_PATH,
    bytes(manifestFromInput(commissioning, new Date(timestamp).toISOString())),
  );
  next.set(
    SOURCE_AUTHORITY_PUBLICATION_PATH,
    bytes({
      schemaVersion: "source-authority-epochs.v1",
      entries: [
        {
          authorityEpoch: SOURCE_EPOCH,
          contractId: SOURCE_CONTRACT_ID,
          approvedContentDigest: SOURCE_APPROVED_DIGEST,
          requestPath: SOURCE_AUTHORITY_REQUEST_PATH,
          requestSubjectSha256: subjectSha256,
          implementation: identity,
          snapshotCommit: snapshot.snapshotCommit,
          legacyAuthorityBase: LEGACY_AUTHORITY_BASE,
          priorCommissioning: subject.legacyCommissioning,
          preserved,
          canonicalState,
          publicationProtocol: "leased-source-authority-publication.v1",
          completionEligible: false,
        },
      ],
    }),
  );
  assert.deepEqual([...next.keys()].sort(), SOURCE_TRANSITION_OUTPUT_PATHS);
  const files: SourceTransitionFile[] = SOURCE_TRANSITION_OUTPUT_PATHS.map(
    (path) => {
      const contents = next.get(path)!;
      return {
        path,
        prior: pin(path, prior.get(path) ?? null),
        next: { bytes: contents.length, sha256: hash(contents) },
        contents,
      };
    },
  );
  assert.deepEqual(
    cleanIdentity(root),
    identity,
    "Implementation identity changed during inspection.",
  );
  assert.equal(await assertActiveAuthorityPublication(root), "legacy");
  for (const value of [
    ...subject.prior,
    ...preserved,
    ...(recordedState ? [] : [canonicalState]),
  ])
    assert.deepEqual(
      pin(value.path, await ordinary(root, value.path)),
      value,
      `Transition input changed during inspection: ${value.path}`,
    );
  return {
    schemaVersion: "source-authority-transition-projection.v1",
    status: "PASS",
    claimScope: "source-authority-transition-inspection",
    publicationAuthorized: false,
    implementationAuditAuthenticated: false,
    independentReviewAuthenticated: false,
    canonicalStateReobserved: recordedState === undefined,
    completionEligible: false,
    subject,
    subjectSha256,
    outputs: files.map(({ path, prior, next }) => ({ path, prior, next })),
    files,
  } as const;
}

export async function prepareSourceAuthorityTransition(input: {
  readonly repositoryRoot: string;
  readonly snapshotCommit: string;
}) {
  return prepareTransition(input);
}

function exactKeys<const K extends string>(
  value: unknown,
  keys: readonly K[],
): asserts value is Record<K, unknown> {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "Request data must be a record.",
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...keys].sort(),
    "Unknown or missing source request fields.",
  );
}
function evidencePin(value: unknown): asserts value is {
  path: typeof SOURCE_IMPLEMENTATION_EVIDENCE_PATH;
  bytes: number;
  sha256: string;
} {
  exactKeys(value, ["path", "bytes", "sha256"]);
  assert.equal(
    value.path,
    SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
    "Implementation evidence has one fixed path.",
  );
  assert(
    Number.isSafeInteger(value.bytes) &&
      Number(value.bytes) > 0 &&
      Number(value.bytes) <= 20_000_000,
  );
  assert(
    typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256),
  );
}
function statePin(value: unknown): asserts value is ReturnType<typeof pin> {
  exactKeys(value, ["path", "exists", "bytes", "sha256"]);
  assert.equal(value.path, "artifacts/orchestrator/state/state.json");
  assert(typeof value.exists === "boolean");
  if (value.exists) {
    assert(
      Number.isSafeInteger(value.bytes) &&
        Number(value.bytes) >= 0 &&
        Number(value.bytes) <= 20_000_000,
    );
    assert(
      typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256),
    );
  } else {
    assert.equal(value.bytes, 0);
    assert.equal(value.sha256, null);
  }
}

/** A binding is a review input, never an implementation-audit or review PASS.
 * The dedicated publisher must authenticate those independent prerequisites. */
export function createSourceAuthorityRequestBinding(
  projection: Awaited<ReturnType<typeof prepareSourceAuthorityTransition>>,
  implementationEvidence: {
    readonly path: typeof SOURCE_IMPLEMENTATION_EVIDENCE_PATH;
    readonly bytes: number;
    readonly sha256: string;
  },
) {
  assert.equal(projection.publicationAuthorized, false);
  assert.equal(projection.completionEligible, false);
  evidencePin(implementationEvidence);
  assert.equal(
    hash(Buffer.from(canonicalJson(projection.subject) + "\n")),
    projection.subjectSha256,
  );
  return {
    schemaVersion: "source-authority-migration-request.v1",
    subject: projection.subject,
    subjectSha256: projection.subjectSha256,
    outputs: projection.outputs,
    implementationEvidence: { ...implementationEvidence },
  } as const;
}

/** Reads a committed request binding from real Git objects. This intentionally
 * authenticates neither the referenced audit's success nor independent review,
 * and never authorizes publication. Normal callers must keep the publication
 * fence; a future recovery owner may use these immutable bytes only after its
 * same-request intent admission. Declared old-state bytes are reobserved by the
 * leased publisher, not adopted or copied into this temporary Git view. */
export async function inspectCommittedSourceAuthorityRequestBinding(input: {
  readonly repositoryRoot: string;
}) {
  const root = await realpath(input.repositoryRoot);
  assert(!/[\r\n\0]/.test(root));
  const head = text(root, "rev-parse", "HEAD");
  exactCommit(root, head);
  const branch = text(root, "symbolic-ref", "--short", "HEAD");
  const requestBytes = await committedOrdinary(
    root,
    head,
    SOURCE_AUTHORITY_REQUEST_PATH,
  );
  const request: unknown = JSON.parse(requestBytes.toString("utf8"));
  exactKeys(request, [
    "schemaVersion",
    "subject",
    "subjectSha256",
    "outputs",
    "implementationEvidence",
  ]);
  assert.equal(request.schemaVersion, "source-authority-migration-request.v1");
  const subject = request.subject;
  exactKeys(subject, [
    "schemaVersion",
    "requestId",
    "authorityEpoch",
    "contractId",
    "approvedContentDigest",
    "approvalRecordSha256",
    "implementation",
    "snapshotCommit",
    "legacyAuthorityBase",
    "legacyCommissioning",
    "canonicalState",
    "preserved",
    "prior",
  ]);
  assert.equal(subject.schemaVersion, "source-authority-request-subject.v1");
  assert.equal(subject.requestId, "ORCH-AUTH-01");
  assert.equal(subject.authorityEpoch, SOURCE_EPOCH);
  assert.equal(subject.contractId, SOURCE_CONTRACT_ID);
  assert.equal(subject.approvedContentDigest, SOURCE_APPROVED_DIGEST);
  assert.equal(subject.approvalRecordSha256, SOURCE_APPROVAL_SHA256);
  assert.equal(subject.legacyAuthorityBase, LEGACY_AUTHORITY_BASE);
  assert.equal(
    hash(Buffer.from(canonicalJson(subject) + "\n")),
    request.subjectSha256,
    "Source request subject digest differs.",
  );
  const implementation = subject.implementation;
  exactKeys(implementation, ["commit", "tree", "branch"]);
  assert(
    typeof implementation.commit === "string" &&
      typeof implementation.tree === "string" &&
      typeof implementation.branch === "string",
  );
  exactCommit(root, implementation.commit);
  assert.equal(
    text(root, "rev-parse", `${implementation.commit}^{tree}`),
    implementation.tree,
  );
  assert.equal(
    implementation.branch,
    branch,
    "Request branch differs from its implementation branch.",
  );
  git(root, ["check-ref-format", "--branch", branch]);
  assert(typeof subject.snapshotCommit === "string");
  exactCommit(root, subject.snapshotCommit);
  git(root, [
    "merge-base",
    "--is-ancestor",
    subject.snapshotCommit,
    implementation.commit,
  ]);
  assert.notEqual(subject.snapshotCommit, implementation.commit);
  statePin(subject.canonicalState);
  evidencePin(request.implementationEvidence);
  const additions = text(
    root,
    "log",
    "--diff-filter=A",
    "--format=%H",
    head,
    "--",
    SOURCE_AUTHORITY_REQUEST_PATH,
  )
    .split("\n")
    .filter(Boolean);
  assert.equal(
    additions.length,
    1,
    "The request requires one separate committed introduction.",
  );
  const requestCommit = additions[0]!;
  const parents = text(
    root,
    "rev-list",
    "--parents",
    "-n",
    "1",
    requestCommit,
  ).split(" ");
  assert.deepEqual(
    parents,
    [requestCommit, implementation.commit],
    "The separate request commit must directly follow its implementation.",
  );
  assert(
    requestBytes.equals(
      git(root, ["show", `${requestCommit}:${SOURCE_AUTHORITY_REQUEST_PATH}`]),
    ),
    "The committed request was rewritten after introduction.",
  );
  const prefix = ".agent/authority-requests/ORCH-AUTH-01/";
  const introduced = git(root, [
    "diff",
    "--name-only",
    "-z",
    implementation.commit,
    requestCommit,
    "--",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  assert(
    introduced.includes(SOURCE_AUTHORITY_REQUEST_PATH) &&
      introduced.every((path) => path.startsWith(prefix)),
    "The separately committed request may add only its fixed request/evidence prefix.",
  );
  const later = git(root, [
    "diff",
    "--name-only",
    "-z",
    requestCommit,
    head,
    "--",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  assert(
    later.every(
      (path) =>
        path.startsWith(prefix) ||
        [
          ".agent/current-exec-plan.md",
          "docs/autonomy-log.md",
          "docs/decision-log.md",
        ].includes(path),
    ),
    "Source implementation or authority changed after the separate request.",
  );
  const auditBytes = await committedOrdinary(
    root,
    head,
    SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
  );
  assert(
    auditBytes.equals(
      git(root, [
        "show",
        `${requestCommit}:${SOURCE_IMPLEMENTATION_EVIDENCE_PATH}`,
      ]),
    ),
    "The referenced implementation evidence was rewritten after the request.",
  );
  assert.equal(auditBytes.length, request.implementationEvidence.bytes);
  assert.equal(hash(auditBytes), request.implementationEvidence.sha256);
  const view = await realpath(
    await mkdtemp(resolve(tmpdir(), "source-request-git-view-")),
  );
  try {
    git(view, ["init", "--quiet", "--initial-branch", branch]);
    await mkdir(resolve(view, ".git/objects/info"), { recursive: true });
    await writeFile(
      resolve(view, ".git/objects/info/alternates"),
      text(
        root,
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "objects",
      ).replaceAll("\\", "/") + "\n",
    );
    git(view, [
      "update-ref",
      `refs/heads/${branch}`,
      implementation.commit,
      "0".repeat(40),
    ]);
    git(view, ["read-tree", implementation.commit]);
    git(view, ["checkout-index", "--all"]);
    const projection = await prepareTransition(
      { repositoryRoot: view, snapshotCommit: subject.snapshotCommit },
      subject.canonicalState,
    );
    const expected = createSourceAuthorityRequestBinding(
      projection,
      request.implementationEvidence,
    );
    assert.equal(
      canonicalJson(request),
      canonicalJson(expected),
      "Request outputs, prior states, history or source command floor differ from the independently reconstructed implementation projection.",
    );
    assert.equal(
      text(root, "rev-parse", "HEAD"),
      head,
      "Request HEAD changed during inspection.",
    );
    assert.equal(text(root, "symbolic-ref", "--short", "HEAD"), branch);
    assert(
      requestBytes.equals(
        await committedOrdinary(root, head, SOURCE_AUTHORITY_REQUEST_PATH),
      ),
    );
    assert(
      auditBytes.equals(
        await committedOrdinary(
          root,
          head,
          SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
        ),
      ),
    );
    return {
      ...projection,
      schemaVersion: "source-authority-request-binding-inspection.v1",
      claimScope: "committed-source-request-binding",
      requestCommit,
      requestSha256: hash(requestBytes),
      observedHead: head,
      implementationEvidence: request.implementationEvidence,
      canonicalStateReobserved: false,
      implementationAuditAuthenticated: false,
      independentReviewAuthenticated: false,
      publicationAuthorized: false,
      completionEligible: false,
    } as const;
  } finally {
    // Only the exact task-owned mkdtemp view is removed. It has no source state;
    // its Git alternates point read-only at the original object database.
    await rm(view, { recursive: true, force: true });
  }
}

/** Ordinary review/CLI entry: pending/mixed publication and dirty input remain
 * refused. The metadata-only Git reconstruction is not a recovery admission. */
export async function inspectSourceAuthorityRequestForReview(input: {
  readonly repositoryRoot: string;
}) {
  const root = await realpath(input.repositoryRoot);
  assert.equal(await assertActiveAuthorityPublication(root), "legacy");
  const identity = cleanIdentity(root);
  const result = await inspectCommittedSourceAuthorityRequestBinding({
    repositoryRoot: root,
  });
  assert.deepEqual(cleanIdentity(root), identity);
  assert.equal(await assertActiveAuthorityPublication(root), "legacy");
  return result;
}
