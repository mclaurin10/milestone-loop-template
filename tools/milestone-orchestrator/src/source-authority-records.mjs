import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AUTHORITY_MIGRATION_PENDING_PATH,
  SOURCE_AUTHORITY_PUBLICATION_PATH,
  SOURCE_AUTHORITY_REQUEST_PATH,
} from "./authority-publication.mjs";
import {
  inspectSourceReviewEvidence,
  readSourceEvidenceReceipt,
  sourceCanonical,
  sourceCommittedRead,
  sourceExactKeys,
  sourceGitText,
  sourceHash,
  sourceRead,
  SOURCE_AUDIT_PREFIX,
} from "./source-authority-evidence.mjs";
import { SOURCE_CONTRACT_ID } from "./authority-publication.mjs";
import {
  inspectCommittedSourceRequest,
  inspectSourceOutputsAtCommit,
  SOURCE_GENERATION_PATHS,
  SOURCE_PUBLICATION_EVIDENCE_PREFIX,
} from "./source-authority-generation.mjs";

const publicationResult = SOURCE_PUBLICATION_EVIDENCE_PREFIX + "result.json";
const objectId = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const iso = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const jsonArtifact = (packet, path) => {
  const artifact = packet.artifacts.get(path);
  assert(artifact, "Publication packet is missing " + path);
  return JSON.parse(artifact.contents.toString());
};

/** Retained bytes identify actual lease Git blobs without requiring unreachable
 * released owners to survive future Git garbage collection. This checks
 * provenance consistency; it cannot mint a review permit or acquire a lease. */
export function inspectSourceLeaseOwner(bytes, expectedObjectId) {
  assert(Buffer.isBuffer(bytes) && objectId(expectedObjectId));
  assert.equal(
    createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex"),
    expectedObjectId,
    "Retained source lease owner differs from its actual Git blob identity.",
  );
  const owner = JSON.parse(bytes.toString());
  sourceExactKeys(owner, [
    "schemaVersion",
    "token",
    "pid",
    "hostname",
    "hostInstanceId",
    "processStartedAt",
    "acquiredAt",
    "operation",
  ]);
  assert.equal(owner.schemaVersion, "2.0.0");
  assert.equal(owner.operation, "authority-migrate");
  assert(
    typeof owner.token === "string" && /^[a-f0-9-]{36}$/.test(owner.token),
  );
  assert(Number.isSafeInteger(owner.pid) && owner.pid > 0);
  assert(typeof owner.hostname === "string" && owner.hostname);
  assert(
    owner.hostInstanceId === null ||
      (typeof owner.hostInstanceId === "string" && owner.hostInstanceId),
  );
  assert(iso(owner.processStartedAt) && iso(owner.acquiredAt));
  return owner;
}

/** The raw append chain binds every attempt to the same durable intent and
 * retains each actual owner. A final event alone cannot substitute for it. */
function inspectPublicationEventChain(bytes, expected, owners) {
  assert(
    Buffer.isBuffer(bytes) &&
      bytes.length > 0 &&
      bytes[bytes.length - 1] === 10,
  );
  const rows = [];
  let offset = 0;
  for (const line of bytes.toString().split("\n").slice(0, -1)) {
    const row = JSON.parse(line);
    sourceExactKeys(row, [
      "observedAt",
      "event",
      "path",
      "requestSha256",
      "intentSha256",
      "lease",
      "previousBytes",
      "previousSha256",
      ...(Object.hasOwn(row, "preparedIntent") ? ["preparedIntent"] : []),
    ]);
    assert(iso(row.observedAt));
    assert.equal(row.requestSha256, expected.requestSha256);
    assert.equal(row.intentSha256, expected.intentSha256);
    assert.equal(row.previousBytes, offset);
    assert.equal(
      row.previousSha256,
      offset === 0 ? null : sourceHash(bytes.subarray(0, offset)),
    );
    sourceExactKeys(row.lease, ["reference", "objectId"]);
    assert.equal(row.lease.reference, "refs/milestone-loop/controller-lease");
    assert(objectId(row.lease.objectId) && owners.has(row.lease.objectId));
    const outputEvent = [
      "before-replace",
      "after-replace",
      "exact-output-already-present",
    ].includes(row.event);
    assert(
      outputEvent
        ? SOURCE_GENERATION_PATHS.includes(row.path)
        : row.path === null,
    );
    assert(
      [
        "attempt-start",
        "intent-published",
        "intent-observed-durable",
        "before-replace",
        "after-replace",
        "exact-output-already-present",
        "completion-recorded",
        "publication-finalized",
      ].includes(row.event),
    );
    if (rows.length === 0) assert.equal(row.event, "attempt-start");
    if (Object.hasOwn(row, "preparedIntent")) {
      assert.equal(
        rows.length,
        0,
        "Only the first attempt may retain the prepared intent.",
      );
      assert.equal(
        sourceHash(readSourcePreparedIntent(bytes)),
        expected.intentSha256,
      );
    }
    rows.push(row);
    offset += Buffer.byteLength(line + "\n");
  }
  assert.equal(offset, bytes.length);
  return rows;
}

/** The fsynced first attempt retains exact planned bytes before active intent.
 * Reading them supplies no mutation permission; retry still needs fresh review
 * and the real lease, clean request, exact prior files and original owner. */
export function readSourcePreparedIntent(bytes) {
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.includes(10));
  const first = JSON.parse(bytes.subarray(0, bytes.indexOf(10)).toString());
  assert.equal(first.event, "attempt-start");
  assert(
    typeof first.preparedIntent === "string" && first.preparedIntent.length > 0,
    "The first pre-intent attempt did not retain its exact prepared intent.",
  );
  const intent = Buffer.from(first.preparedIntent, "base64");
  assert.equal(intent.toString("base64"), first.preparedIntent);
  assert.equal(sourceHash(intent), first.intentSha256);
  return intent;
}

export function inspectSourcePreparedPublicationEvents(
  bytes,
  expected,
  owners,
) {
  const rows = inspectPublicationEventChain(bytes, expected, owners);
  assert(
    rows.every((row) => row.event === "attempt-start"),
    "A pre-intent retry contains active publication events.",
  );
  assert.equal(
    sourceHash(readSourcePreparedIntent(bytes)),
    expected.intentSha256,
  );
  assert.deepEqual(rows[0].lease, expected.originalLease);
  return rows;
}

export function inspectSourcePublicationEvents(bytes, expected, owners) {
  const rows = inspectPublicationEventChain(bytes, expected, owners);
  assert.equal(
    rows.filter((row) =>
      ["intent-published", "intent-observed-durable"].includes(row.event),
    ).length,
    1,
  );
  assert(rows.some((row) => row.event === "completion-recorded"));
  assert.equal(rows.at(-1).event, "publication-finalized");
  assert.deepEqual(rows.at(-1).lease, expected.finalLease);
  assert.deepEqual(rows[0].lease, expected.originalLease);
  for (const path of SOURCE_GENERATION_PATHS) {
    const replacements = rows.filter(
      (row) => row.path === path && row.event === "after-replace",
    );
    assert(
      replacements.length <= 1,
      "An output was replaced more than once: " + path,
    );
    assert(
      replacements.length === 1 ||
        rows.some(
          (row) =>
            row.path === path && row.event === "exact-output-already-present",
        ),
      "Output has no recorded exact publication observation: " + path,
    );
    if (replacements.length) {
      const index = rows.indexOf(replacements[0]);
      assert.equal(rows[index - 1]?.event, "before-replace");
      assert.equal(rows[index - 1]?.path, path);
      assert.deepEqual(rows[index - 1]?.lease, replacements[0].lease);
    }
  }
  return rows;
}

function introduction(root, path, head) {
  const entries = sourceGitText(
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
    entries.length,
    1,
    "Source publication needs one committed introduction: " + path,
  );
  assert(objectId(entries[0]));
  return entries[0];
}

/** This is a normal native reader. The actual publication producer is the only
 * writer of the fixed packet; this function never returns mutation authority. */
export async function inspectSourcePublicationPacket(
  root,
  context,
  prefix,
  commit = null,
) {
  const { binding } = context;
  const packet = await readSourceEvidenceReceipt(
    root,
    prefix,
    {
      stageId: "source-authority-publication",
      commandId: "loop:authority:migrate",
      requiredKinds: [
        "source-authority-publication",
        "source-authority-publication-intent",
        "source-authority-publication-events",
        "source-authority-publication-runtime",
      ],
    },
    commit,
  );
  const report = jsonArtifact(packet, "publication.json");
  sourceExactKeys(report, [
    "schemaVersion",
    "status",
    "completionEligible",
    "commitRequired",
    "resumed",
    "request",
    "implementation",
    "invocation",
    "reviewReceiptSha256",
    "freshReviewReceiptSha256",
    "freshReview",
    "executingSourceSha256",
    "implementationReceiptSha256",
    "intentSha256",
    "state",
    "outputs",
    "lease",
    "completedIntentPath",
    "eventLogPath",
  ]);
  assert.equal(report.schemaVersion, "source-authority-publication-result.v1");
  assert.equal(report.status, "PASS");
  assert.equal(report.completionEligible, false);
  assert.equal(report.commitRequired, true);
  assert.equal(typeof report.resumed, "boolean");
  assert.deepEqual(report.request, {
    commit: binding.requestCommit,
    sha256: binding.requestSha256,
    subjectSha256: binding.subjectSha256,
  });
  assert.deepEqual(report.implementation, binding.implementation);
  assert.deepEqual(report.invocation, {
    commit: binding.requestCommit,
    tree: sourceGitText(root, "rev-parse", binding.requestCommit + "^{tree}"),
    branch: binding.implementation.branch,
  });
  assert.equal(report.implementationReceiptSha256, context.audit.sha256);
  assert(
    digest(report.executingSourceSha256) &&
      digest(report.reviewReceiptSha256) &&
      digest(report.freshReviewReceiptSha256),
  );
  const intentBytes = packet.artifacts.get("completed-intent.json")?.contents;
  assert(intentBytes && sourceHash(intentBytes) === report.intentSha256);
  const intent = JSON.parse(intentBytes.toString());
  sourceExactKeys(intent, [
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
  assert.equal(intent.schemaVersion, "source-authority-migration-intent.v1");
  for (const key of [
    "request",
    "invocation",
    "implementation",
    "reviewReceiptSha256",
    "implementationReceiptSha256",
    "state",
    "outputs",
  ])
    assert.deepEqual(
      intent[key],
      report[key],
      "Publication report differs from the actual intent: " + key,
    );
  assert.deepEqual(report.outputs, context.request.outputs);
  assert.deepEqual(report.state.mirror, context.request.subject.canonicalState);
  assert.equal(report.state.reference, "refs/milestone-loop/state");
  assert(
    report.state.objectId === null
      ? report.state.stateSha256 === null
      : objectId(report.state.objectId) && digest(report.state.stateSha256),
  );
  const transaction =
    "artifacts/orchestrator/source-authority/" + binding.requestSha256;
  assert.equal(
    report.completedIntentPath,
    transaction + "/completed-intent.json",
  );
  assert.equal(report.eventLogPath, transaction + "/publication-events.jsonl");
  const owners = new Map();
  for (const [path, artifact] of packet.artifacts) {
    if (!path.startsWith("lease-owners/")) continue;
    const match = /^lease-owners\/([a-f0-9]{40})\.json$/.exec(path);
    assert(match);
    owners.set(match[1], inspectSourceLeaseOwner(artifact.contents, match[1]));
  }
  assert(
    owners.has(intent.leaseAtCreation.objectId) &&
      owners.has(report.lease.objectId),
  );
  const events = inspectSourcePublicationEvents(
    packet.artifacts.get("publication-events.jsonl")?.contents,
    {
      requestSha256: binding.requestSha256,
      intentSha256: report.intentSha256,
      finalLease: report.lease,
      originalLease: intent.leaseAtCreation,
    },
    owners,
  );
  for (const sha256 of new Set([
    report.reviewReceiptSha256,
    report.freshReviewReceiptSha256,
  ])) {
    const reviewPrefix = "reviews/" + sha256 + "/";
    const review = await inspectSourceReviewEvidence(
      root,
      binding,
      commit,
      prefix + reviewPrefix,
    );
    assert.equal(review.sha256, sha256);
    for (const [path, artifact] of [
      ["result.json", { contents: review.bytes }],
      ...review.artifacts,
    ])
      assert(
        packet.artifacts
          .get(reviewPrefix + path)
          ?.contents.equals(artifact.contents),
        "Publication packet omits retained reviewer evidence: " + path,
      );
    if (sha256 === report.freshReviewReceiptSha256)
      assert.deepEqual(report.freshReview, review.report.reviewer);
  }
  const runtime = jsonArtifact(packet, "runtime.json");
  sourceExactKeys(runtime, [
    "schemaVersion",
    "nodeVersion",
    "pnpmVersion",
    "platform",
    "architecture",
    "invocation",
    "sourceStateAdopted",
  ]);
  assert.equal(
    runtime.schemaVersion,
    "source-authority-publication-runtime.v1",
  );
  assert.equal(runtime.nodeVersion, "v24.18.0");
  assert.equal(runtime.pnpmVersion, "11.15.1");
  assert(["win32", "linux", "darwin"].includes(runtime.platform));
  assert(["x64", "arm64"].includes(runtime.architecture));
  assert.deepEqual(runtime.invocation, report.invocation);
  assert.equal(runtime.sourceStateAdopted, false);
  return {
    packet,
    report,
    runtime,
    events,
    completionEligible: false,
    publicationAuthorized: false,
  };
}

/** Ordinary authority readers require the complete committed packet and actual
 * activation ancestry; an uncommitted packet inspection grants no activation. */
export async function inspectCommittedSourcePublication(root) {
  assert.equal(
    await sourceRead(root, AUTHORITY_MIGRATION_PENDING_PATH, true),
    null,
    "Source authority publication remains pending.",
  );
  const head = sourceGitText(root, "rev-parse", "HEAD");
  const activation = introduction(
    root,
    SOURCE_AUTHORITY_PUBLICATION_PATH,
    head,
  );
  assert.equal(
    introduction(root, publicationResult, head),
    activation,
    "Source outputs and command-owned publication evidence must be committed together.",
  );
  const context = await inspectCommittedSourceRequest(root);
  const { binding } = context;
  assert.deepEqual(
    sourceGitText(root, "rev-list", "--parents", "-n", "1", activation).split(
      " ",
    ),
    [activation, binding.requestCommit],
    "Committed source activation must directly follow its separate immutable request.",
  );
  const changed = sourceGitText(
    root,
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    activation,
  )
    .split("\n")
    .filter(Boolean);
  assert(
    changed.every(
      (path) =>
        SOURCE_GENERATION_PATHS.includes(path) ||
        path.startsWith(SOURCE_PUBLICATION_EVIDENCE_PREFIX),
    ),
    "Activation commit contains unrelated implementation or authority changes.",
  );
  assert(!changed.includes(SOURCE_AUTHORITY_REQUEST_PATH));
  const generation = await inspectSourceOutputsAtCommit(
    root,
    context,
    activation,
  );
  const evidence = await inspectSourcePublicationPacket(
    root,
    context,
    SOURCE_PUBLICATION_EVIDENCE_PREFIX,
    activation,
  );
  const recordedPaths = sourceGitText(
    root,
    "ls-tree",
    "-r",
    "--name-only",
    activation,
    "--",
    SOURCE_PUBLICATION_EVIDENCE_PREFIX,
  )
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(
    recordedPaths,
    [
      publicationResult,
      ...[...evidence.packet.artifacts.keys()].map(
        (path) => SOURCE_PUBLICATION_EVIDENCE_PREFIX + path,
      ),
    ].sort(),
    "Committed publication packet contains undeclared files.",
  );
  // All recorded publication evidence is immutable, including its original
  // introduction. A delete/re-add or intermediate rewrite is not a revision.
  assert.equal(
    sourceGitText(
      root,
      "log",
      "--format=%H",
      activation + ".." + head,
      "--",
      SOURCE_AUTHORITY_PUBLICATION_PATH,
      SOURCE_PUBLICATION_EVIDENCE_PREFIX,
      SOURCE_AUTHORITY_REQUEST_PATH,
      SOURCE_AUDIT_PREFIX,
    ),
    "",
    "Committed source publication/request history was rewritten.",
  );
  await sourceCommittedRead(
    root,
    activation,
    SOURCE_AUTHORITY_PUBLICATION_PATH,
  );
  for (const file of context.snapshot.files.filter(
    (file) => file.epoch === "source",
  )) {
    const live = await sourceRead(root, file.rootPath);
    assert(
      live && live.length === file.bytes && sourceHash(live) === file.sha256,
      "Active source authority differs from the approved generation: " +
        file.rootPath,
    );
  }
  // These generated scheduling records remain the exact commissioned source
  // generation. Future amendments need their own authenticated protocol.
  for (const path of [
    ".agent/verification-manifest.json",
    "tools/milestone-orchestrator/config/source-commissioning-input.json",
    "tools/milestone-orchestrator/config/verification-scope-policy.json",
  ])
    assert(
      (await sourceRead(root, path)).equals(generation.files.get(path)),
      "Active source schedule differs from committed publication: " + path,
    );
  const pkg = JSON.parse((await sourceRead(root, "package.json")).toString());
  const activationPackage = JSON.parse(
    generation.files.get("package.json").toString(),
  );
  assert.equal(pkg.milestoneLoop.verification.contractId, SOURCE_CONTRACT_ID);
  assert.equal(pkg.milestoneLoop.verification.defaultProfile, "readiness");
  assert.deepEqual(
    pkg.milestoneLoop.productionBuild,
    activationPackage.milestoneLoop.productionBuild,
  );
  for (const [name, argv] of Object.entries(activationPackage.scripts))
    assert.equal(
      pkg.scripts[name],
      argv,
      "Protected source command changed: " + name,
    );
  assert.equal(
    await sourceRead(root, AUTHORITY_MIGRATION_PENDING_PATH, true),
    null,
  );
  assert.equal(sourceGitText(root, "rev-parse", "HEAD"), head);
  return {
    scope: "source",
    activationCommit: activation,
    context,
    generation,
    ...evidence,
    identitySha256: sourceHash(
      Buffer.from(
        sourceCanonical({
          activation,
          request: binding.requestSha256,
          receipt: evidence.packet.sha256,
        }) + "\n",
      ),
    ),
    completionEligible: false,
    publicationAuthorized: false,
  };
}
