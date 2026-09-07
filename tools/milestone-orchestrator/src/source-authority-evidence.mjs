import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  inspectSourceAuditExecution,
  inspectSourceAuditReports,
} from "./source-authority-audit-reports.mjs";

export const SOURCE_REQUEST_PREFIX = ".agent/authority-requests/ORCH-AUTH-01/";
export const SOURCE_AUDIT_PREFIX =
  SOURCE_REQUEST_PREFIX + "implementation-evidence/";
export const SOURCE_REVIEW_PREFIX = SOURCE_REQUEST_PREFIX + "review-evidence/";
export const SOURCE_REVIEW_CHECK_IDS = Object.freeze([
  "approvedNormativeDigest",
  "strictAncestorSnapshot",
  "auditedImplementation",
  "separateCommittedRequest",
  "exactOutputSet",
  "completeLegacyHistory",
  "compatibleConsumers",
  "leaseAndDurableIntent",
  "recoveryAndConcurrency",
  "preservedStateAndNoAdoption",
  "commandOwnedEvidence",
  "noReadinessOrHistoricalPromotion",
]);
export const SOURCE_AUDIT_COMMANDS = Object.freeze(
  [
    {
      id: "typecheck",
      argv: ["pnpm", "typecheck"],
      stageId: "typecheck",
      commandId: "typecheck",
      requiredKinds: ["typecheck-report"],
    },
    {
      id: "lint",
      argv: ["pnpm", "lint"],
      stageId: "format-lint",
      commandId: "lint",
      requiredKinds: ["lint-report"],
    },
    {
      id: "format",
      argv: ["pnpm", "format:check"],
      stageId: "format-lint",
      commandId: "format:check",
      requiredKinds: ["format-report"],
    },
    {
      id: "architecture",
      argv: ["pnpm", "lint:source-architecture"],
      stageId: "source-static",
      commandId: "lint:source-architecture",
      requiredKinds: ["source-architecture-report"],
    },
    {
      id: "dependencies",
      argv: ["pnpm", "verify:source-dependencies"],
      stageId: "source-static",
      commandId: "verify:source-dependencies",
      requiredKinds: ["source-dependencies-report"],
    },
    {
      id: "build",
      argv: ["pnpm", "build"],
      stageId: "production-build",
      commandId: "build",
      requiredKinds: [
        "build-report",
        "source-release-archive",
        "source-release-manifest",
        "source-release-consumer",
      ],
    },
    {
      id: "invariants",
      argv: ["pnpm", "test:invariants"],
      stageId: "invariant-suite",
      commandId: "test:invariants",
      requiredKinds: ["invariant-suite-report"],
    },
    {
      id: "unit",
      argv: ["pnpm", "test:unit"],
      stageId: "bootstrap-tests",
      commandId: "test:unit",
      requiredKinds: ["vitest-report", "test-run-summary"],
    },
  ].map((command) =>
    Object.freeze({
      ...command,
      argv: Object.freeze(command.argv),
      requiredKinds: Object.freeze(command.requiredKinds),
    }),
  ),
);

export const sourceHash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function sourceCanonical(value) {
  if (Array.isArray(value))
    return "[" + value.map(sourceCanonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + sourceCanonical(value[key]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function sourceExactKeys(
  value,
  keys,
  label = "Source authority record",
) {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    label + " must be a record.",
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...keys].sort(),
    label + " has unknown or missing fields.",
  );
  return value;
}
export function sourceRelativePath(path) {
  assert(
    typeof path === "string" &&
      path.length > 0 &&
      path.length <= 500 &&
      !/[\\\0\r\n:]/.test(path) &&
      !path.startsWith("/") &&
      path.split("/").every((part) => part && part !== "." && part !== ".."),
    "Source evidence path is not contained and canonical.",
  );
  return path;
}
function sourceGitEnvironment() {
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
  ])
    assert(
      !process.env[name],
      "Source authority refuses redirecting Git environment: " + name,
    );
  return { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
}
export function sourceGit(root, args, allowed = [0]) {
  const result = spawnSync("git", ["-C", root, ...args], {
    env: sourceGitEnvironment(),
    windowsHide: true,
    encoding: null,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert(
    !result.error && allowed.includes(result.status),
    result.error?.message ??
      result.stderr?.toString() ??
      "Bounded source Git inspection failed.",
  );
  return result.stdout;
}
export const sourceGitText = (root, ...args) =>
  sourceGit(root, args).toString("utf8").trim();
export async function sourceRead(root, path, optional = false) {
  sourceRelativePath(path);
  const canonicalRoot = await realpath(root),
    absolute = resolve(canonicalRoot, path);
  try {
    const info = await lstat(absolute);
    assert(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.nlink === 1 &&
        info.size <= 20_000_000 &&
        (await realpath(absolute)) === absolute,
      "Source authority input must be a bounded contained regular file: " +
        path,
    );
    return await readFile(absolute);
  } catch (error) {
    if (optional && error.code === "ENOENT") {
      let parent = dirname(absolute);
      while (parent !== canonicalRoot) {
        try {
          const info = await lstat(parent);
          assert(
            info.isDirectory() &&
              !info.isSymbolicLink() &&
              (await realpath(parent)) === parent,
            "Missing source input has a redirected parent: " + path,
          );
          break;
        } catch (parentError) {
          if (parentError.code !== "ENOENT") throw parentError;
          parent = dirname(parent);
        }
      }
      return null;
    }
    throw error;
  }
}
export const sourceFilePin = (path, bytes) => ({
  path,
  exists: bytes !== null,
  bytes: bytes?.length ?? 0,
  sha256: bytes === null ? null : sourceHash(bytes),
});
export function sourceIdentity(root, clean = false) {
  const values = sourceGitText(
    root,
    "rev-parse",
    "HEAD",
    "HEAD^{tree}",
    "--symbolic-full-name",
    "HEAD",
  ).split("\n");
  assert.equal(values.length, 3);
  const [commit, tree, reference] = values;
  assert(
    typeof commit === "string" &&
      typeof tree === "string" &&
      typeof reference === "string",
  );
  assert(
    reference.startsWith("refs/heads/"),
    "Source authority requires attached HEAD.",
  );
  const branch = reference.slice("refs/heads/".length);
  assert(
    /^[a-f0-9]{40}$/.test(commit) && /^[a-f0-9]{40}$/.test(tree) && branch,
  );
  sourceGit(root, ["check-ref-format", "--branch", branch]);
  if (clean) {
    assert.equal(
      sourceGitText(root, "status", "--porcelain=v1", "--untracked-files=all"),
      "",
      "Source authority operation requires a clean committed checkout.",
    );
    sourceGit(root, ["diff-index", "--cached", "--quiet", "HEAD", "--"]);
  }
  return { commit, tree, branch };
}
export async function sourceCommittedRead(root, commit, path) {
  return sourceEvidenceReader(root, commit).read(path);
}

/** Read actual immutable Git bytes for a historical comparison. Callers must
 * separately validate current inputs; this never grants activation or mutation. */
export function sourceHistoricalRead(root, commit, path) {
  return sourceHistoricalFiles(root, commit, [path]).get(path);
}

/** One operation-local Git batch for immutable historical objects. Returned
 * buffers are observations only; no reader or mutation authority escapes. */
export function sourceHistoricalFiles(root, commit, paths) {
  assert(/^[a-f0-9]{40}$/.test(commit));
  const reader = sourceEvidenceReader(root, commit);
  reader.prepare(paths);
  return new Map(paths.map((path) => [path, reader.historical(path)]));
}

// A fresh reader belongs to one inspection only. Git object bytes are immutable
// within that inspection; every use still rereads the canonical working file.
// No caller can supply this private reader or use it as mutation permission.
function sourceEvidenceReader(root, commit) {
  if (commit === null)
    return { prepare: () => {}, read: (path) => sourceRead(root, path) };
  assert(/^[a-f0-9]{40}$/.test(commit));
  const entries = new Map(
    sourceGit(root, ["ls-tree", "-r", "-z", "--full-tree", commit])
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((row) => {
        const separator = row.indexOf("\t");
        assert(separator > 0);
        return [row.slice(separator + 1), row.slice(0, separator)];
      }),
  );
  const objects = new Map();
  let retainedBytes = 0;
  const objectFor = (path) => {
    sourceRelativePath(path);
    const entry = entries.get(path);
    assert(
      typeof entry === "string" && /^100644 blob [a-f0-9]{40}$/.test(entry),
      "Source evidence is not one committed regular file: " + path,
    );
    return entry.slice("100644 blob ".length);
  };
  const prepare = (paths) => {
    const missing = [...new Set(paths.map(objectFor))].filter(
      (id) => !objects.has(id),
    );
    if (missing.length === 0) return;
    const result = spawnSync("git", ["-C", root, "cat-file", "--batch"], {
      env: sourceGitEnvironment(),
      input: missing.join("\n") + "\n",
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 65_000_000,
    });
    if (result.error || result.status !== 0)
      throw new Error(result.error?.message ?? result.stderr.toString());
    const output = result.stdout;
    let offset = 0;
    for (const id of missing) {
      const end = output.indexOf(10, offset);
      assert(end >= offset, "Git evidence batch header is incomplete.");
      const header = output.subarray(offset, end).toString("ascii").split(" ");
      assert.equal(header.length, 3);
      assert.equal(header[0], id);
      assert.equal(header[1], "blob");
      assert(/^(0|[1-9][0-9]*)$/.test(header[2]));
      const size = Number(header[2]);
      assert(Number.isSafeInteger(size) && size <= 20_000_000);
      offset = end + 1;
      assert(offset + size < output.length && output[offset + size] === 10);
      const contents = Buffer.from(output.subarray(offset, offset + size));
      assert.equal(
        createHash("sha1")
          .update(`blob ${size}\0`)
          .update(contents)
          .digest("hex"),
        id,
        "Git evidence object bytes do not match their actual blob identity.",
      );
      retainedBytes += size;
      // Existing limits permit a 20 MB receipt plus 64 MB declared artifacts.
      assert(
        retainedBytes <= 84_000_000,
        "Committed evidence inspection exceeds its byte bound.",
      );
      objects.set(id, contents);
      offset += size + 1;
    }
    assert.equal(offset, output.length, "Git evidence batch has extra bytes.");
  };
  return {
    prepare,
    historical: (path) => {
      prepare([path]);
      return Buffer.from(objects.get(objectFor(path)));
    },
    read: async (path) => {
      prepare([path]);
      const live = await sourceRead(root, path);
      assert(live);
      assert(
        live.equals(objects.get(objectFor(path))),
        "Source evidence changed after its committed observation: " + path,
      );
      return live;
    },
  };
}

/** Source authority records additionally require regular committed files and
 * an exact receipt schema. This is a source-only native consumer; it does not
 * change the legacy command-receipt reader or its acceptance meaning.
 * @param {string} root
 * @param {string} prefix
 * @param {{stageId: string, commandId: string, requiredKinds?: readonly string[]}} expected
 * @param {string | null} [commit]
 */
export async function readSourceEvidenceReceipt(
  root,
  prefix,
  expected,
  commit = null,
) {
  return readSourceReceiptWithReader(
    prefix,
    expected,
    sourceEvidenceReader(root, commit),
  );
}

async function readSourceReceiptWithReader(prefix, expected, reader) {
  assert(prefix.endsWith("/"));
  sourceRelativePath(prefix.slice(0, -1));
  const read = (path) => reader.read(prefix + path);
  const bytes = await read("result.json");
  assert(bytes, "Source command-owned receipt is missing.");
  const receipt = JSON.parse(bytes.toString());
  sourceExactKeys(
    receipt,
    ["schemaVersion", "stageId", "commandId", "status", "checks", "artifacts"],
    "Source command-owned receipt",
  );
  assert.equal(receipt.schemaVersion, "1.0.0");
  assert.equal(receipt.stageId, expected.stageId);
  assert.equal(receipt.commandId, expected.commandId);
  assert.equal(receipt.status, "PASS");
  assert(
    Array.isArray(receipt.checks) &&
      receipt.checks.length > 0 &&
      receipt.checks.length <= 100,
  );
  const checks = new Set();
  for (const check of receipt.checks) {
    sourceExactKeys(check, ["id", "summary", "status"], "Source receipt check");
    assert(
      typeof check.id === "string" &&
        check.id &&
        !checks.has(check.id) &&
        typeof check.summary === "string" &&
        check.summary &&
        check.status === "PASS",
    );
    checks.add(check.id);
  }
  assert(
    Array.isArray(receipt.artifacts) &&
      receipt.artifacts.length > 0 &&
      receipt.artifacts.length <= 5000,
  );
  const artifacts = new Map();
  const declaredPaths = new Set();
  let total = 0;
  for (const artifact of receipt.artifacts) {
    sourceExactKeys(
      artifact,
      ["path", "kind", "bytes", "sha256"],
      "Source receipt artifact",
    );
    sourceRelativePath(artifact.path);
    assert(
      artifact.path !== "result.json" && !declaredPaths.has(artifact.path),
    );
    declaredPaths.add(artifact.path);
    assert(
      typeof artifact.kind === "string" &&
        artifact.kind &&
        Number.isSafeInteger(artifact.bytes) &&
        artifact.bytes > 0 &&
        artifact.bytes <= 20_000_000 &&
        /^[a-f0-9]{64}$/.test(artifact.sha256),
    );
    total += artifact.bytes;
    assert(
      total <= 64_000_000,
      "Source evidence receipt exceeds its total bound.",
    );
  }
  reader.prepare([...declaredPaths].map((path) => prefix + path));
  for (const artifact of receipt.artifacts) {
    const contents = await read(artifact.path);
    assert.equal(contents.length, artifact.bytes, artifact.path);
    assert.equal(sourceHash(contents), artifact.sha256, artifact.path);
    artifacts.set(artifact.path, { ...artifact, contents });
  }
  for (const kind of expected.requiredKinds ?? [])
    assert(
      receipt.artifacts.some((artifact) => artifact.kind === kind),
      "Source receipt is missing required artifact kind: " + kind,
    );
  return { receipt, bytes, sha256: sourceHash(bytes), artifacts };
}

export async function inspectSourceImplementationEvidence(
  root,
  request,
  requestCommit,
) {
  const reader = sourceEvidenceReader(root, requestCommit);
  const evidence = await readSourceReceiptWithReader(
    SOURCE_AUDIT_PREFIX,
    {
      stageId: "source-authority-implementation",
      commandId: "source-authority-audit",
      requiredKinds: [
        "source-authority-implementation-audit",
        "source-authority-transition-inspection",
      ],
    },
    reader,
  );
  assert.equal(
    request.implementationEvidence.path,
    SOURCE_AUDIT_PREFIX + "result.json",
  );
  assert.equal(request.implementationEvidence.bytes, evidence.bytes.length);
  assert.equal(request.implementationEvidence.sha256, evidence.sha256);
  const report = JSON.parse(
    evidence.artifacts.get("audit.json")?.contents.toString() ?? "null",
  );
  sourceExactKeys(
    report,
    [
      "schemaVersion",
      "status",
      "completionEligible",
      "implementation",
      "runtime",
      "subjectSha256",
      "commands",
    ],
    "Source implementation audit",
  );
  assert.equal(
    report.schemaVersion,
    "source-authority-implementation-audit.v1",
  );
  assert.equal(report.status, "PASS");
  assert.equal(report.completionEligible, false);
  assert.deepEqual(report.implementation, request.subject.implementation);
  assert.equal(report.subjectSha256, request.subjectSha256);
  sourceExactKeys(report.runtime, [
    "nodeVersion",
    "pnpmVersion",
    "platform",
    "architecture",
  ]);
  assert.equal(report.runtime.nodeVersion, "v24.18.0");
  assert.equal(report.runtime.pnpmVersion, "11.15.1");
  assert(["linux", "win32"].includes(report.runtime.platform));
  assert.equal(report.runtime.architecture, "x64");
  const projection = JSON.parse(
    evidence.artifacts.get("transition-inspection.json")?.contents.toString() ??
      "null",
  );
  assert.equal(
    projection.schemaVersion,
    "source-authority-transition-projection.v1",
  );
  assert.deepEqual(projection.subject, request.subject);
  assert.equal(projection.subjectSha256, request.subjectSha256);
  assert.deepEqual(projection.outputs, request.outputs);
  for (const key of [
    "publicationAuthorized",
    "implementationAuditAuthenticated",
    "independentReviewAuthenticated",
    "completionEligible",
  ])
    assert.equal(projection[key], false);
  assert.equal(projection.canonicalStateReobserved, true);
  assert(
    Array.isArray(report.commands) &&
      report.commands.length === SOURCE_AUDIT_COMMANDS.length,
  );
  // The committed audit packet and the audited implementation use separate,
  // operation-local readers. Later normal code fixes may not rewrite the old
  // implementation observation or substitute current bytes for its Git objects.
  const implementationReader = sourceEvidenceReader(
    root,
    report.implementation.commit,
  );
  const policyPath = "tools/source-release-policy.json";
  implementationReader.prepare([policyPath]);
  const policy = JSON.parse(
    implementationReader.historical(policyPath).toString(),
  );
  const implementationPaths = [
    ...new Set([
      policyPath,
      ...policy.payloadFiles,
      ...policy.sourceCheckFiles,
      "tools/milestone-orchestrator/config/test-ownership.json",
      "tools/milestone-orchestrator/config/invariant-suite.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ]),
  ];
  implementationReader.prepare(implementationPaths);
  const implementationFiles = new Map(
    implementationPaths.map((path) => [
      path,
      implementationReader.historical(path),
    ]),
  );
  const readNestedReceipt = async (prefix, expected) => {
    const nested = await readSourceReceiptWithReader(
      SOURCE_AUDIT_PREFIX + prefix,
      expected,
      reader,
    );
    for (const [path, contents] of [
      ["result.json", nested.bytes],
      ...[...nested.artifacts.values()].map((artifact) => [
        artifact.path,
        artifact.contents,
      ]),
    ]) {
      const parent = evidence.artifacts.get(prefix + path);
      assert(
        parent && parent.contents.equals(contents),
        "Implementation audit packet does not bind nested command evidence: " +
          prefix +
          path,
      );
    }
    return nested;
  };
  const reports = new Map();
  for (const [index, expected] of SOURCE_AUDIT_COMMANDS.entries()) {
    const command = report.commands[index];
    sourceExactKeys(command, [
      "id",
      "argv",
      "stageId",
      "commandId",
      "requiredKinds",
      "exitCode",
      "startedAt",
      "finishedAt",
      "receipt",
    ]);
    for (const key of ["id", "argv", "stageId", "commandId", "requiredKinds"])
      assert.deepEqual(command[key], expected[key]);
    assert.equal(command.exitCode, 0);
    assert(
      Number.isFinite(Date.parse(command.startedAt)) &&
        Date.parse(command.finishedAt) >= Date.parse(command.startedAt),
    );
    if (index)
      assert(
        Date.parse(command.startedAt) >=
          Date.parse(report.commands[index - 1].finishedAt),
        "Implementation audit commands overlap or are out of order.",
      );
    sourceExactKeys(command.receipt, ["path", "bytes", "sha256"]);
    assert.equal(
      command.receipt.path,
      "commands/" + expected.id + "/result.json",
    );
    const nestedPrefix = "commands/" + expected.id + "/";
    const child = await readNestedReceipt(nestedPrefix, expected);
    assert.equal(command.receipt.bytes, child.bytes.length);
    assert.equal(command.receipt.sha256, child.sha256);
    const execution = inspectSourceAuditExecution({
      command,
      expected,
      implementation: report.implementation,
      artifacts: evidence.artifacts,
    });
    const childReport = await inspectSourceAuditReports({
      expected,
      child,
      implementation: report.implementation,
      runtime: report.runtime,
      implementationFiles,
      execution,
      readNestedReceipt: (prefix, nestedExpected) =>
        readNestedReceipt(nestedPrefix + prefix, nestedExpected),
    });
    reports.set(expected.id, childReport);
  }
  assert.deepEqual(
    reports.get("architecture").packageGraph,
    reports.get("dependencies").packageGraph,
    "Implementation audit package graphs disagree.",
  );
  const builtArchitecture = JSON.parse(
    evidence.artifacts
      .get("commands/build/source-release/build-evidence/architecture.json")
      ?.contents.toString() ?? "null",
  );
  assert.deepEqual(
    builtArchitecture,
    reports.get("architecture"),
    "Consumed build architecture differs from the audited source architecture.",
  );
  return { ...evidence, report, projection };
}

export function sourceReviewOutputSchema(binding) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "requestCommit",
      "requestSha256",
      "subjectSha256",
      "implementationCommit",
      "decision",
      "checks",
      "findings",
    ],
    properties: {
      requestCommit: { type: "string", const: binding.requestCommit },
      requestSha256: { type: "string", const: binding.requestSha256 },
      subjectSha256: { type: "string", const: binding.subjectSha256 },
      implementationCommit: {
        type: "string",
        const: binding.implementation.commit,
      },
      decision: { type: "string", enum: ["approve", "reject", "escalate"] },
      checks: {
        type: "array",
        minItems: SOURCE_REVIEW_CHECK_IDS.length,
        maxItems: SOURCE_REVIEW_CHECK_IDS.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "passed", "evidence"],
          properties: {
            id: { type: "string", enum: SOURCE_REVIEW_CHECK_IDS },
            passed: { type: "boolean" },
            evidence: { type: "string", minLength: 1 },
          },
        },
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "description"],
          properties: {
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
            },
            description: { type: "string", minLength: 1 },
          },
        },
      },
    },
  };
}
export function assertSourceReviewDecision(review, binding) {
  sourceExactKeys(
    review,
    [
      "requestCommit",
      "requestSha256",
      "subjectSha256",
      "implementationCommit",
      "decision",
      "checks",
      "findings",
    ],
    "Independent source review",
  );
  for (const key of ["requestCommit", "requestSha256", "subjectSha256"])
    assert.equal(review[key], binding[key]);
  assert.equal(review.implementationCommit, binding.implementation.commit);
  assert.equal(
    review.decision,
    "approve",
    "Independent source review did not approve publication.",
  );
  assert(Array.isArray(review.checks));
  assert.deepEqual(
    review.checks.map((check) => check.id).sort(),
    [...SOURCE_REVIEW_CHECK_IDS].sort(),
  );
  for (const check of review.checks) {
    sourceExactKeys(check, ["id", "passed", "evidence"]);
    assert.equal(
      check.passed,
      true,
      "Independent source review check did not pass: " + check.id,
    );
    assert(typeof check.evidence === "string" && check.evidence.trim());
  }
  assert(Array.isArray(review.findings));
  for (const finding of review.findings) {
    sourceExactKeys(finding, ["severity", "description"]);
    assert(
      ["low", "medium"].includes(finding.severity),
      "Independent review has a blocking finding.",
    );
    assert(
      typeof finding.description === "string" && finding.description.trim(),
    );
  }
  return review;
}

/** @param {string} root
 * @param {{requestCommit: string, requestSha256: string, subjectSha256: string, implementation: {commit: string, tree: string, branch: string}}} binding
 * @param {string | null} reviewCommit
 * @param {string} [prefix]
 */
export async function inspectSourceReviewEvidence(
  root,
  binding,
  reviewCommit,
  prefix = SOURCE_REVIEW_PREFIX,
) {
  const evidence = await readSourceEvidenceReceipt(
    root,
    prefix,
    {
      stageId: "source-authority-review",
      commandId: "source-authority-review",
      requiredKinds: [
        "source-authority-review",
        "source-authority-reviewer-events",
        "source-authority-reviewer-invocation",
        "source-authority-review-prompt",
      ],
    },
    reviewCommit,
  );
  const parse = (path) =>
    JSON.parse(evidence.artifacts.get(path)?.contents.toString() ?? "null");
  const report = parse("review.json"),
    invocation = parse("agent-invocation.json");
  sourceExactKeys(report, [
    "schemaVersion",
    "completionEligible",
    "request",
    "implementation",
    "review",
    "reviewer",
  ]);
  assert.equal(report.schemaVersion, "source-authority-review.v1");
  assert.equal(report.completionEligible, false);
  assert.deepEqual(report.request, {
    commit: binding.requestCommit,
    sha256: binding.requestSha256,
    subjectSha256: binding.subjectSha256,
  });
  assert.deepEqual(report.implementation, binding.implementation);
  assertSourceReviewDecision(report.review, binding);
  sourceExactKeys(report.reviewer, ["threadId", "invocationId", "gateway"]);
  assert.equal(report.reviewer.gateway, "SdkCodexGateway");
  assert(
    typeof report.reviewer.threadId === "string" &&
      report.reviewer.threadId.length > 0,
  );
  assert.equal(invocation.role, "reviewer");
  assert.equal(invocation.threadId, report.reviewer.threadId);
  assert.equal(invocation.id, report.reviewer.invocationId);
  assert.equal(invocation.status, "completed");
  assert.equal(invocation.attempt, 1);
  assert.equal(invocation.escalated, false);
  assert.equal(invocation.error, null);
  assert(
    Number.isFinite(Date.parse(invocation.startedAt)) &&
      Date.parse(invocation.finishedAt) >= Date.parse(invocation.startedAt),
  );
  const events = evidence.artifacts
    .get("reviewer-events.jsonl")
    ?.contents.toString()
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(events && events.length > 2);
  const threads = events.filter((event) => event.type === "thread.started");
  assert.equal(threads.length, 1);
  assert.equal(threads[0].thread_id, report.reviewer.threadId);
  assert(events.some((event) => event.type === "turn.completed"));
  assert(
    !events.some(
      (event) => event.type === "turn.failed" || event.type === "error",
    ),
  );
  const final = events
    .filter(
      (event) =>
        event.type === "item.completed" && event.item?.type === "agent_message",
    )
    .at(-1);
  assert.deepEqual(JSON.parse(final?.item.text ?? "null"), report.review);
  const prompt = evidence.artifacts
    .get("reviewer-prompt.txt")
    ?.contents.toString();
  assert(
    prompt &&
      [
        binding.requestCommit,
        binding.requestSha256,
        binding.subjectSha256,
        binding.implementation.commit,
      ].every((pin) => prompt.includes(pin)),
  );
  return { ...evidence, report, invocation };
}
