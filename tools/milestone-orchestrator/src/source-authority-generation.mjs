import assert from "node:assert/strict";
// A literal MJS-to-TS edge lets both native Node and the unchanged TypeScript
// resolver consume the same epoch implementation and fixed constants.
export {
  inspectSourceEpochSnapshot,
  SOURCE_APPROVAL_PATH,
  SOURCE_APPROVAL_SHA256,
  SOURCE_CONTRACT_ID,
  SOURCE_EPOCH,
  SOURCE_SNAPSHOT_ROOT_FILES,
} from "./source-epoch-snapshot.ts";
import {
  SOURCE_AUTHORITY_PUBLICATION_PATH,
  SOURCE_AUTHORITY_REQUEST_PATH,
  SOURCE_CONTRACT_ID,
  SOURCE_EPOCH,
} from "./authority-publication.mjs";
import {
  inspectSourceImplementationEvidence,
  SOURCE_AUDIT_PREFIX,
  SOURCE_REQUEST_PREFIX,
  sourceCanonical,
  sourceCommittedRead,
  sourceExactKeys,
  sourceFilePin,
  sourceGit,
  sourceGitText,
  sourceHash,
  sourceHistoricalFiles,
  sourceRead,
} from "./source-authority-evidence.mjs";

export const SOURCE_PUBLICATION_EVIDENCE_PREFIX =
  SOURCE_REQUEST_PREFIX + "publication-evidence/";
import {
  expectedSourceFloor,
  SOURCE_SCOPE_POLICY_ID,
} from "./verification-scope.mjs";
export { SOURCE_SCOPE_POLICY_ID } from "./verification-scope.mjs";
export const SOURCE_GENERATION_PATHS = Object.freeze(
  [
    ".agent/completed/source-authority-epochs.json",
    ".agent/verification-manifest.json",
    "AGENTS.md",
    "CONTRACT.md",
    "PROJECT_GOAL.md",
    "evals/ACCEPTANCE.md",
    "evals/HIDDEN_VALIDATION_PROTOCOL.md",
    "evals/acceptance-manifest.json",
    "evals/immutable-contract-lock.json",
    "package.json",
    "tools/milestone-orchestrator/config/source-commissioning-input.json",
    "tools/milestone-orchestrator/config/verification-scope-policy.json",
  ].sort(),
);
const legacyLedger = ".agent/completed/verification-manifest-amendments.json";
const preservedPaths = [
  "evals/authority-revisions/ORCH-AUTH-01/approval.json",
  legacyLedger,
  ".agent/completed/loop-recommissioning-verification.json",
  ".agent/readiness-profile-activated.json",
  ".github/workflows/exact-runtime-ci.yml",
  "pnpm-lock.yaml",
  "scripts/verify.mjs",
  "tools/milestone-orchestrator/config/default.json",
  "tools/milestone-orchestrator/config/invariant-suite.json",
].sort();
const mutableImplementationPaths = new Set([
  "pnpm-lock.yaml",
  "scripts/verify.mjs",
  "tools/milestone-orchestrator/config/default.json",
  "tools/milestone-orchestrator/config/invariant-suite.json",
]);
function introduction(root, path, head) {
  const commits = sourceGitText(
    root,
    "log",
    "--diff-filter=A",
    "--format=%H",
    head,
    "--",
    path,
  )
    .split("\n")
    .filter(Boolean);
  assert.equal(
    commits.length,
    1,
    "Source authority record needs exactly one committed introduction: " + path,
  );
  const commit = commits[0];
  assert.equal(typeof commit, "string");
  assert(commit);
  return commit;
}
function ancestry(root, ancestor, descendant, strict = false) {
  assert(/^[a-f0-9]{40}$/.test(ancestor) && /^[a-f0-9]{40}$/.test(descendant));
  if (strict)
    assert.notEqual(
      ancestor,
      descendant,
      "Source snapshot/request ancestry must be strict.",
    );
  sourceGit(root, ["merge-base", "--is-ancestor", ancestor, descendant]);
}
function changedDuring(root, from, through) {
  return sourceGitText(
    root,
    "log",
    "--format=",
    "--name-only",
    `${from}..${through}`,
  )
    .split("\n")
    .filter(Boolean);
}
function pinSchema(pin) {
  sourceExactKeys(pin, ["path", "exists", "bytes", "sha256"]);
  assert(
    typeof pin.exists === "boolean" &&
      Number.isSafeInteger(pin.bytes) &&
      pin.bytes >= 0 &&
      pin.bytes <= 20_000_000,
  );
  if (pin.exists) assert(/^[a-f0-9]{64}$/.test(pin.sha256));
  else assert(pin.bytes === 0 && pin.sha256 === null);
}

/** Read immutable prerequisites from actual Git objects. This reader itself
 * neither grants a mutation capability nor bypasses a normal pending fence. */
export async function inspectSourceRequestPrerequisites(root) {
  return inspectRequest(root, true);
}

/** Historical request evidence remains immutable after activation. Ordinary
 * verified implementation fixes need not reproduce old implementation bytes. */
export async function inspectCommittedSourceRequest(root) {
  return inspectRequest(root, false);
}

async function inspectRequest(root, checkCurrentImplementation) {
  const head = sourceGitText(root, "rev-parse", "HEAD");
  const requestCommit = introduction(root, SOURCE_AUTHORITY_REQUEST_PATH, head);
  const requestBytes = await sourceCommittedRead(
    root,
    requestCommit,
    SOURCE_AUTHORITY_REQUEST_PATH,
  );
  assert(
    requestBytes.equals(
      await sourceCommittedRead(root, head, SOURCE_AUTHORITY_REQUEST_PATH),
    ),
  );
  const request = JSON.parse(requestBytes.toString());
  sourceExactKeys(request, [
    "schemaVersion",
    "subject",
    "subjectSha256",
    "outputs",
    "implementationEvidence",
  ]);
  assert.equal(request.schemaVersion, "source-authority-migration-request.v1");
  sourceExactKeys(request.implementationEvidence, ["path", "bytes", "sha256"]);
  const subject = request.subject;
  sourceExactKeys(subject, [
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
  assert.equal(
    request.subjectSha256,
    sourceHash(Buffer.from(sourceCanonical(subject) + "\n")),
  );
  sourceExactKeys(subject.implementation, ["commit", "tree", "branch"]);
  const implementation = subject.implementation;
  assert.equal(
    sourceGitText(root, "rev-parse", `${implementation.commit}^{tree}`),
    implementation.tree,
  );
  sourceGit(root, ["check-ref-format", "--branch", implementation.branch]);
  assert.deepEqual(
    sourceGitText(
      root,
      "rev-list",
      "--parents",
      "-n",
      "1",
      requestCommit,
    ).split(" "),
    [requestCommit, implementation.commit],
  );
  assert(
    changedDuring(root, implementation.commit, requestCommit).every(
      (path) =>
        path === SOURCE_AUTHORITY_REQUEST_PATH ||
        path.startsWith(SOURCE_AUDIT_PREFIX),
    ),
    "The separately committed request contains unrelated changes.",
  );
  ancestry(root, subject.snapshotCommit, implementation.commit, true);
  const snapshotModule = await import("./source-epoch-snapshot.ts");
  const snapshot = await snapshotModule.inspectSourceEpochSnapshot({
    repositoryRoot: root,
    snapshotCommit: subject.snapshotCommit,
  });
  assert.equal(subject.approvedContentDigest, snapshot.approvedContentDigest);
  assert.equal(subject.approvalRecordSha256, snapshot.approvalRecordSha256);
  assert.equal(subject.legacyAuthorityBase, snapshot.legacyAuthorityBase);
  pinSchema(subject.canonicalState);
  assert.equal(
    subject.canonicalState.path,
    "artifacts/orchestrator/state/state.json",
  );
  assert(
    Array.isArray(subject.prior) &&
      Array.isArray(subject.preserved) &&
      Array.isArray(request.outputs),
  );
  assert.deepEqual(
    subject.prior.map((pin) => pin.path),
    SOURCE_GENERATION_PATHS,
  );
  assert.deepEqual(
    request.outputs.map((file) => file.path),
    SOURCE_GENERATION_PATHS,
  );
  assert.deepEqual(
    subject.preserved.map((pin) => pin.path),
    preservedPaths,
  );
  const originalPins = [...subject.prior, ...subject.preserved];
  originalPins.forEach(pinSchema);
  const originals = sourceHistoricalFiles(
    root,
    implementation.commit,
    originalPins.filter((pin) => pin.exists).map((pin) => pin.path),
  );
  for (const pin of originalPins) {
    pinSchema(pin);
    if (pin.exists) {
      const original = originals.get(pin.path);
      assert.deepEqual(sourceFilePin(pin.path, original), pin);
    } else {
      assert.equal(pin.path, SOURCE_AUTHORITY_PUBLICATION_PATH);
      assert.equal(
        sourceGitText(root, "ls-tree", implementation.commit, "--", pin.path),
        "",
      );
    }
  }
  for (const pin of subject.preserved) {
    if (!checkCurrentImplementation && mutableImplementationPaths.has(pin.path))
      continue;
    const live = await sourceRead(root, pin.path);
    assert.deepEqual(
      sourceFilePin(pin.path, live),
      pin,
      "Preserved source history/input changed: " + pin.path,
    );
  }
  sourceExactKeys(subject.legacyCommissioning, [
    "anchor",
    "ledgerSha256",
    "entryCount",
    "ledgerHistory",
  ]);
  const oldLedgerBytes = sourceGit(root, [
    "show",
    `${implementation.commit}:${legacyLedger}`,
  ]);
  assert.equal(
    sourceHash(oldLedgerBytes),
    subject.legacyCommissioning.ledgerSha256,
  );
  const oldLedger = JSON.parse(oldLedgerBytes.toString());
  assert.equal(
    oldLedger.entries.length,
    subject.legacyCommissioning.entryCount,
  );
  const history = sourceGitText(
    root,
    "log",
    "--reverse",
    "--format=%H",
    implementation.commit,
    "--",
    legacyLedger,
  )
    .split("\n")
    .filter(Boolean)
    .map((commit) => ({
      commit,
      sha256: sourceHash(
        sourceGit(root, ["show", `${commit}:${legacyLedger}`]),
      ),
    }));
  assert.deepEqual(subject.legacyCommissioning.ledgerHistory, history);
  assert(history.length > 0);
  ancestry(
    root,
    subject.legacyCommissioning.anchor.commit,
    implementation.commit,
    true,
  );
  assert.equal(
    sourceGitText(
      root,
      "rev-parse",
      `${subject.legacyCommissioning.anchor.commit}^{tree}`,
    ),
    subject.legacyCommissioning.anchor.tree,
  );
  const audit = await inspectSourceImplementationEvidence(
    root,
    request,
    requestCommit,
  );
  for (const file of request.outputs) {
    sourceExactKeys(file, ["path", "prior", "next"]);
    sourceExactKeys(file.next, ["bytes", "sha256"]);
    assert.deepEqual(
      file.prior,
      subject.prior.find((pin) => pin.path === file.path),
    );
    const proposed = audit.artifacts.get("proposed-root/" + file.path);
    assert(
      proposed &&
        proposed.bytes === file.next.bytes &&
        proposed.sha256 === file.next.sha256,
      "Audited output differs from the exact committed request: " + file.path,
    );
    const approved = snapshot.files.find(
      (entry) => entry.epoch === "source" && entry.rootPath === file.path,
    );
    if (approved)
      assert(
        approved.bytes === file.next.bytes &&
          approved.sha256 === file.next.sha256,
        "Requested authority output differs from the approved strict-ancestor snapshot.",
      );
  }
  const binding = {
    requestCommit,
    requestSha256: sourceHash(requestBytes),
    subjectSha256: request.subjectSha256,
    implementation,
  };
  assert.equal(sourceGitText(root, "rev-parse", "HEAD"), head);
  return {
    head,
    request,
    requestBytes,
    binding,
    snapshot,
    audit,
    completionEligible: false,
    publicationAuthorized: false,
  };
}

/** Pure complete-generation inspection used before finalizing a held intent.
 * It checks the exact committed prerequisites again and returns no permission
 * to bypass normal consumers' pending/committed-publication fences. */
export async function inspectCompleteSourceOutputs(root) {
  return inspectSourceOutputsAgainstRequest(
    root,
    await inspectSourceRequestPrerequisites(root),
  );
}

/** Pure output semantics against an already inspected request. This grants no
 * mutation or activation permission. The held publisher has rehashed every
 * request/audit/preserved pin immediately before and after this call; ordinary
 * readers use inspectCompleteSourceOutputs to inspect prerequisites themselves. */
export async function inspectSourceOutputsAgainstRequest(root, prerequisites) {
  return inspectOutputs(root, prerequisites, (path) => sourceRead(root, path));
}

/** Validate all twelve outputs at the actual activation commit without
 * freezing unrelated later implementation fixes to their activation bytes. */
export async function inspectSourceOutputsAtCommit(
  root,
  prerequisites,
  commit,
) {
  const files = sourceHistoricalFiles(
    root,
    commit,
    prerequisites.request.outputs.map((file) => file.path),
  );
  return inspectOutputs(root, prerequisites, (path) => files.get(path));
}

async function inspectOutputs(root, prerequisites, readOutput) {
  const { request, snapshot, binding } = prerequisites;
  const live = new Map();
  for (const file of request.outputs) {
    const bytes = await readOutput(file.path);
    assert(
      bytes.length === file.next.bytes &&
        sourceHash(bytes) === file.next.sha256,
      "Incomplete or foreign source publication output: " + file.path,
    );
    live.set(file.path, bytes);
  }
  const parse = (path) => JSON.parse(live.get(path).toString());
  const pkg = parse("package.json"),
    lock = parse("evals/immutable-contract-lock.json"),
    manifest = parse(".agent/verification-manifest.json"),
    policy = parse(
      "tools/milestone-orchestrator/config/verification-scope-policy.json",
    ),
    input = parse(
      "tools/milestone-orchestrator/config/source-commissioning-input.json",
    );
  assert.equal(pkg.milestoneLoop.verification.contractId, SOURCE_CONTRACT_ID);
  assert.equal(pkg.milestoneLoop.verification.defaultProfile, "readiness");
  const priorPackage = JSON.parse(
    sourceGit(root, [
      "show",
      `${binding.implementation.commit}:package.json`,
    ]).toString(),
  );
  assert.deepEqual(pkg.scripts, priorPackage.scripts);
  assert.equal(lock.schemaVersion, "2.0.0");
  assert.equal(lock.authorityEpoch, SOURCE_EPOCH);
  assert.equal(manifest.commissioning.id, SOURCE_CONTRACT_ID);
  assert.equal(manifest.commissioning.baseCommit, snapshot.snapshotCommit);
  assert.equal(manifest.commissioning.profile, "readiness");
  assert.deepEqual(manifest.commissioning, {
    ...input.commissioning,
    createdAt: new Date(
      sourceGitText(
        root,
        "show",
        "-s",
        "--format=%cI",
        binding.implementation.commit,
      ),
    ).toISOString(),
  });
  assert.equal(
    input.sources.immutableContractLockSha256,
    sourceHash(live.get("evals/immutable-contract-lock.json")),
  );
  assert.deepEqual(manifest.focusedCommands, expectedSourceFloor());
  assert.deepEqual(input.focusedCommands, manifest.focusedCommands);
  assert.equal(manifest.scopePolicyId, SOURCE_SCOPE_POLICY_ID);
  assert.equal(input.scopePolicyId, SOURCE_SCOPE_POLICY_ID);
  assert.equal(policy.id, SOURCE_SCOPE_POLICY_ID);
  assert.equal(policy.mode, "shadow-only");
  assert.equal(policy.unknownDisposition, "fail-broad");
  assert.equal(policy.closureSuppressionAllowed, false);
  for (const checks of [
    ...Object.values(policy.mandatoryChecks),
    ...Object.values(policy.workspaceChecks),
  ])
    assert.deepEqual(
      checks,
      expectedSourceFloor().map((command) => command.id),
    );
  const ledger = parse(SOURCE_AUTHORITY_PUBLICATION_PATH);
  sourceExactKeys(ledger, ["schemaVersion", "entries"]);
  assert.equal(ledger.schemaVersion, "source-authority-epochs.v1");
  assert(Array.isArray(ledger.entries) && ledger.entries.length === 1);
  const entry = ledger.entries[0];
  sourceExactKeys(entry, [
    "authorityEpoch",
    "contractId",
    "approvedContentDigest",
    "requestPath",
    "requestSubjectSha256",
    "implementation",
    "snapshotCommit",
    "legacyAuthorityBase",
    "priorCommissioning",
    "preserved",
    "canonicalState",
    "publicationProtocol",
    "completionEligible",
  ]);
  assert.equal(entry.authorityEpoch, SOURCE_EPOCH);
  assert.equal(entry.contractId, SOURCE_CONTRACT_ID);
  assert.equal(entry.approvedContentDigest, snapshot.approvedContentDigest);
  assert.equal(entry.requestPath, SOURCE_AUTHORITY_REQUEST_PATH);
  assert.equal(entry.requestSubjectSha256, binding.subjectSha256);
  assert.deepEqual(entry.implementation, binding.implementation);
  assert.equal(entry.snapshotCommit, snapshot.snapshotCommit);
  assert.equal(entry.legacyAuthorityBase, snapshot.legacyAuthorityBase);
  assert.deepEqual(
    entry.priorCommissioning,
    request.subject.legacyCommissioning,
  );
  assert.deepEqual(entry.preserved, request.subject.preserved);
  assert.deepEqual(entry.canonicalState, request.subject.canonicalState);
  assert.equal(
    entry.publicationProtocol,
    "leased-source-authority-publication.v1",
  );
  assert.equal(entry.completionEligible, false);
  return {
    ...prerequisites,
    files: live,
    manifest,
    policy,
    input,
    lock,
    entry,
  };
}
