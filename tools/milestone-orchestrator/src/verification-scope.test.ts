import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertVerificationResultScope,
  SOURCE_AGGREGATE_SCHEMA_VERSION,
  SOURCE_TIER_SCHEMA_VERSION,
  SOURCE_VERIFICATION_STAGES,
  SOURCE_VERIFICATION_STAGE_IDS,
  createSourceQualifierDispatch,
  inspectSourceQualifierDispatch,
  sourceVerificationScope,
} from "./verification-scope.mjs";
import {
  assertActiveAuthorityPublication,
  SOURCE_AUTHORITY_PUBLICATION_PATH,
  SOURCE_CONTRACT_ID,
  SOURCE_EPOCH,
} from "./authority-publication.mjs";
import {
  validateVerificationTierResult,
  validateSourceVerificationTierResult,
} from "./schema.js";
import { trustedTestExecutionProviderIdentity } from "../test/fixtures.js";
import type { SourceVerificationScopeExpectation } from "./contracts.js";
import {
  parseAuthoritativeVerification,
  parseIncompleteSourceVerification,
} from "./verifier.js";
import { unattestedExecutionProviderIdentity } from "./execution-provider-identity.js";

describe("source authority history in unborn legacy repositories", () => {
  async function fixture(
    run: (
      root: string,
      git: (args: string[], input?: string) => string,
    ) => Promise<void>,
  ) {
    const parent = await realpath(tmpdir());
    const root = await realpath(
      await mkdtemp(join(parent, "source-legacy-history-")),
    );
    const git = (args: string[], input?: string) => {
      const result = spawnSync(
        "git",
        [
          "-C",
          root,
          "-c",
          "user.name=History fixture",
          "-c",
          "user.email=history@example.invalid",
          ...args,
        ],
        { encoding: "utf8", windowsHide: true, timeout: 30_000, input },
      );
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    try {
      git(["init", "--initial-branch=fixture"]);
      await run(root, git);
    } finally {
      expect(dirname(root)).toBe(parent);
      expect(await realpath(root)).toBe(root);
      await rm(root, { recursive: true, force: true });
    }
  }
  it("accepts an actual unborn branch before and after private legacy state history", async () => {
    await fixture(async (root, git) => {
      await expect(assertActiveAuthorityPublication(root)).resolves.toBe(
        "legacy",
      );
      const tree = git(["mktree"], "");
      const commit = git([
        "commit-tree",
        tree,
        "-m",
        "Private legacy state history fixture",
      ]);
      git(["update-ref", "refs/milestone-loop/state", commit]);
      await expect(assertActiveAuthorityPublication(root)).resolves.toBe(
        "legacy",
      );
      expect(git(["symbolic-ref", "HEAD"])).toBe("refs/heads/fixture");
    });
  });
  it.each(["branch", "detached"])(
    "rejects a missing commit in a corrupt %s HEAD",
    async (kind) => {
      await fixture(async (root) => {
        const path =
          kind === "branch" ? ".git/refs/heads/fixture" : ".git/HEAD";
        await writeFile(resolve(root, path), "1".repeat(40) + "\n");
        await expect(assertActiveAuthorityPublication(root)).rejects.toThrow(
          "Source authority rollback history cannot be inspected",
        );
      });
    },
  );
  it("rejects a branch pointing to a blob instead of a commit", async () => {
    await fixture(async (root, git) => {
      const blob = git(
        ["hash-object", "-w", "--stdin"],
        "Non-commit branch fixture\n",
      );
      await writeFile(resolve(root, ".git/refs/heads/fixture"), blob + "\n");
      await expect(assertActiveAuthorityPublication(root)).rejects.toThrow(
        "Source authority rollback history cannot be inspected",
      );
    });
  });
  it.each(["ref", "reflog"])(
    "rejects an unborn branch when a %s retains source publication history",
    async (history) => {
      await fixture(async (root, git) => {
        const path = resolve(root, SOURCE_AUTHORITY_PUBLICATION_PATH);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, "{}\n");
        git(["add", "--", SOURCE_AUTHORITY_PUBLICATION_PATH]);
        git(["commit", "--quiet", "-m", "Source publication history fixture"]);
        await rm(path);
        git(["symbolic-ref", "HEAD", "refs/heads/unborn"]);
        if (history === "reflog")
          git(["update-ref", "-d", "refs/heads/fixture"]);
        await expect(assertActiveAuthorityPublication(root)).rejects.toThrow(
          "cannot be rolled back to legacy",
        );
      });
    },
  );
});

describe("source verifier dispatch correlation", () => {
  it("creates fresh bounded identities and rejects candidate, provider and digest substitution", () => {
    const candidate = {
      gitCommit: "1".repeat(40),
      gitTree: "2".repeat(40),
      workingTreeDirty: false,
    };
    const provider = trustedTestExecutionProviderIdentity();
    const first = createSourceQualifierDispatch(
      "source-dispatch-1",
      candidate,
      provider,
    );
    const second = createSourceQualifierDispatch(
      "source-dispatch-1",
      candidate,
      provider,
    );
    expect(second.qualifierRun.nonce).not.toBe(first.qualifierRun.nonce);
    expect(
      inspectSourceQualifierDispatch(
        JSON.stringify(first),
        candidate,
        provider,
      ),
    ).toEqual(first);
    expect(() =>
      inspectSourceQualifierDispatch(
        first,
        { ...candidate, gitTree: "3".repeat(40) },
        provider,
      ),
    ).toThrow("actual candidate/provider");
    expect(() =>
      inspectSourceQualifierDispatch(
        first,
        candidate,
        unattestedExecutionProviderIdentity(null, process.version),
      ),
    ).toThrow("actual candidate/provider");
    expect(() =>
      inspectSourceQualifierDispatch(
        {
          ...first,
          qualifierRun: {
            ...first.qualifierRun,
            identitySha256: "4".repeat(64),
          },
        },
        candidate,
        provider,
      ),
    ).toThrow("actual candidate/provider");
    const scope = sourceVerificationScope(
      candidate,
      "full-source-qualification",
      first.qualifierRun,
    );
    expect(scope.fixtureCandidates).toEqual([]);
    expect(scope).not.toHaveProperty("completionEligible");
    expect(() =>
      assertVerificationResultScope(
        { schemaVersion: SOURCE_AGGREGATE_SCHEMA_VERSION, candidate, scope },
        { kind: "aggregate", scope: "source", ...scope },
      ),
    ).not.toThrow();
  });
});

function fixture() {
  const sourceCandidate = {
    gitCommit: "1".repeat(40),
    gitTree: "2".repeat(40),
    workingTreeDirty: false,
  };
  const fixtureCandidates = [
    {
      id: "bootstrap-a",
      contractId: "generated-adopter.v1",
      authorityEpoch: null,
      candidate: {
        gitCommit: "3".repeat(40),
        gitTree: "4".repeat(40),
        workingTreeDirty: false,
      },
    },
  ];
  const qualifierRun = {
    runId: "qualifier-1",
    nonce: "5".repeat(64),
    identitySha256: "6".repeat(64),
  };
  return {
    value: {
      schemaVersion: SOURCE_AGGREGATE_SCHEMA_VERSION,
      candidate: sourceCandidate,
      scope: {
        contractId: SOURCE_CONTRACT_ID,
        authorityEpoch: SOURCE_EPOCH,
        claimScope: "orchestrator-template",
        purpose: "candidate-support",
        sourceCandidate,
        fixtureCandidates,
        qualifierRun,
      },
    },
    expected: {
      kind: "aggregate",
      scope: "source",
      purpose: "candidate-support",
      sourceCandidate,
      fixtureCandidates,
      qualifierRun,
    },
  };
}

async function sourceAggregateFixture(root: string) {
  const f = fixture();
  const scope = {
    ...f.value.scope,
    purpose: "full-source-qualification" as const,
    claimScope: "orchestrator-template" as const,
  };
  const expectedScope: SourceVerificationScopeExpectation = {
    ...f.expected,
    kind: "aggregate",
    scope: "source",
    purpose: "full-source-qualification",
  };
  const provider = trustedTestExecutionProviderIdentity();
  const artifactRoot = "artifacts/source-aggregate";
  const stages = [];
  let firstArtifact = "",
    firstReceipt = "";
  for (const [stageIndex, stage] of SOURCE_VERIFICATION_STAGES.entries()) {
    const passing = stageIndex < 5;
    const commands = [];
    for (const [commandIndex, script] of stage.scripts.entries()) {
      const stem =
        String(commandIndex + 1).padStart(2, "0") +
        "-" +
        script.replaceAll(":", "-");
      const relative = `stages/${stage.id}/${stem}`;
      const directory = join(root, artifactRoot, relative);
      const checks = [
        {
          id: "reader-fixture",
          status: "PASS",
          summary:
            "Test artifact bytes for exercising the production reader; not qualification.",
        },
      ];
      const artifacts = [];
      if (passing) {
        await mkdir(directory, { recursive: true });
        for (const [i, kind] of stage.requiredArtifactKinds.entries()) {
          const path = `evidence-${i}.txt`,
            contents = Buffer.from(
              `reader fixture ${stage.id} ${script} ${kind}\n`,
            );
          await writeFile(join(directory, path), contents);
          artifacts.push({
            path,
            kind,
            bytes: contents.length,
            sha256: createHash("sha256").update(contents).digest("hex"),
          });
          if (!firstArtifact) firstArtifact = join(directory, path);
        }
        const receiptPath = join(directory, "result.json");
        await writeFile(
          receiptPath,
          JSON.stringify({
            schemaVersion: "1.0.0",
            stageId: stage.id,
            commandId: script,
            status: "PASS",
            checks,
            artifacts,
          }),
        );
        if (!firstReceipt) firstReceipt = receiptPath;
      }
      commands.push({
        script,
        displayCommand: `pnpm run ${script}`,
        status: passing ? "PASS" : "NOT_READY",
        exitCode: passing ? 0 : null,
        signal: null,
        durationMs: 1,
        message: "Reader fixture",
        executionProvider: provider,
        log: passing ? `logs/${stage.id}-${stem}.log` : null,
        ...(passing ? { artifactDirectory: relative } : {}),
        evidence: passing
          ? {
              valid: true,
              message: "Fixture evidence",
              checks,
              receipt: `${relative}/result.json`,
              artifacts: artifacts.map((a) => ({
                ...a,
                path: `${relative}/${a.path}`,
              })),
            }
          : null,
      });
    }
    stages.push({
      id: stage.id,
      required: true,
      status: passing ? "PASS" : "NOT_READY",
      checks: [],
      commands,
    });
  }
  const value = {
    ...f.value,
    scope,
    runId: "source-incomplete-reader",
    status: "NOT_READY",
    exitCode: 2,
    artifactRoot,
    profile: {
      id: "readiness",
      configuredDefault: "readiness",
      selectedByOverride: false,
      autonomousReadinessEquivalent: false,
    },
    completion: {
      claim: "source_machine_qualified_for_human_acceptance",
      eligible: false,
      reasons: ["verification_status_not_pass"],
    },
    executionProvider: provider,
    candidateFinal: { ...f.value.candidate },
    identityDrift: { detected: false, fields: [] },
    summary: {
      requiredStageCount: 11,
      stageCounts: { PASS: 5, NOT_READY: 6, FAIL: 0, ERROR: 0 },
    },
    stages,
  };
  const resultPath = join(root, artifactRoot, "result.json"),
    copiedResultPath = join(root, "retained.json");
  return {
    value,
    firstArtifact,
    firstReceipt,
    copiedResultPath,
    persist: () => writeFile(resultPath, JSON.stringify(value)),
    parse: () =>
      parseIncompleteSourceVerification({
        workspacePath: root,
        expectedCommit: f.value.candidate.gitCommit,
        expectedTree: f.value.candidate.gitTree,
        expectedRunId: value.runId,
        observedExitCode: 2,
        resultPath,
        copiedResultPath,
        expectedScope,
        expectedExecutionProvider: provider,
      }),
  };
}

describe("incomplete source aggregate evidence consumer", () => {
  it("refuses an unknown body field before copying partial evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "source-aggregate-reader-"));
    try {
      const f = await sourceAggregateFixture(root);
      Object.assign(f.value, { sourceReadinessOverride: true });
      await f.persist();
      await expect(f.parse()).rejects.toThrow(/unknown result field/);
      expect(existsSync(f.copiedResultPath)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("validates real child receipt bytes while preserving missing source qualification", async () => {
    const root = await mkdtemp(join(tmpdir(), "source-aggregate-reader-"));
    try {
      const f = await sourceAggregateFixture(root);
      await f.persist();
      const result = await f.parse();
      expect(result).toMatchObject({
        status: "NOT_READY",
        resultSchemaVersion: "3.0.0",
        completionEligible: false,
        autonomousReadinessEquivalent: false,
        completionClaim: "source_machine_qualified_for_human_acceptance",
        requiredStageCount: 11,
      });
      expect(result.validatedArtifactCount).toBe(16);
      expect(result.notReadyStageIds).toEqual(
        SOURCE_VERIFICATION_STAGE_IDS.slice(5),
      );
      expect(JSON.parse(await readFile(f.copiedResultPath, "utf8"))).toEqual(
        f.value,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each([
    "source PASS",
    "legacy claim",
    "omitted stage",
    "stage order",
    "foreign scope",
    "candidate drift",
    "artifact tamper",
    "missing receipt",
  ])("rejects %s without copying a trusted result", async (mutation) => {
    const root = await mkdtemp(join(tmpdir(), "source-aggregate-reader-"));
    try {
      const f = await sourceAggregateFixture(root);
      if (mutation === "source PASS") f.value.status = "PASS";
      if (mutation === "legacy claim")
        f.value.completion.claim = "autonomous_readiness";
      if (mutation === "omitted stage") f.value.stages.pop();
      if (mutation === "stage order") f.value.stages.reverse();
      if (mutation === "foreign scope")
        f.value.scope.contractId = "generated-adopter.v1";
      if (mutation === "candidate drift")
        f.value.candidateFinal.gitCommit = "f".repeat(40);
      if (mutation === "artifact tamper")
        await writeFile(f.firstArtifact, "tampered");
      if (mutation === "missing receipt") await rm(f.firstReceipt);
      await f.persist();
      await expect(f.parse()).rejects.toThrow();
      expect(existsSync(f.copiedResultPath)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function sourceTierFixture() {
  const f = fixture();
  const provider = trustedTestExecutionProviderIdentity();
  const candidate = { baseCommit: "a".repeat(40), ...f.value.candidate };
  const expected: SourceVerificationScopeExpectation = {
    ...f.expected,
    kind: "tier",
    scope: "source",
    purpose: "candidate-support",
  };
  const value = {
    schemaVersion: SOURCE_TIER_SCHEMA_VERSION,
    scope: f.value.scope,
    completionEligible: false,
    runId: "source-tier-reader",
    tier: "candidate",
    status: "PASS",
    exitCode: 0,
    authoritative: false,
    executionProvider: provider,
    providerCompletionEligible: provider.completionEligible,
    candidate,
    candidateFinal: { ...candidate },
    changedPaths: ["tools/example.ts"],
    invariantSuiteId: "source-invariants",
    invariantSuiteSha256: "7".repeat(64),
    scopePolicySha256: "8".repeat(64),
    shadowSelectionPath: null,
    selectedCheckIds: ["test-invariants"],
    actualCheckIds: ["test-invariants"],
    fullClosureCheckIds: [],
    commands: [
      {
        id: "test-invariants",
        argv: ["pnpm", "test:invariants"],
        status: "PASS",
        exitCode: 0,
        signal: null,
        startedAt: "2026-09-06T00:00:00.000Z",
        finishedAt: "2026-09-06T00:00:01.000Z",
        durationMs: 1000,
        stdoutPath: "logs/stdout.log",
        stderrPath: "logs/stderr.log",
        receipt: {
          path: "commands/invariants/result.json",
          sha256: "9".repeat(64),
          bytes: 123,
        },
        receiptAbsenceReason: null,
        artifactCount: 1,
        artifactBytes: 456,
        testCounts: null,
        failureClass: null,
        message: "Decoder fixture only; artifacts are not authenticated here.",
        executionProvider: provider,
      },
    ],
    exactVerification: null,
    identityDrift: { detected: false, fields: [] },
    reviewRequired: false,
    telemetryManifestPath: null,
    startedAt: "2026-09-06T00:00:00.000Z",
    finishedAt: "2026-09-06T00:00:01.000Z",
    durationMs: 1000,
  };
  return { value, expected };
}

function fullSourceTierFixture() {
  const f = sourceTierFixture();
  const purpose = "full-source-qualification" as const;
  const scope = { ...f.value.scope, purpose };
  return {
    expected: { ...f.expected, purpose },
    value: {
      ...f.value,
      scope,
      tier: "periodic",
      status: "NOT_READY",
      exitCode: 2,
      exactVerification: {
        invokedWithNoArguments: true,
        resultPath: "exact/result.json",
        resultSha256: "b".repeat(64),
        status: "NOT_READY",
        exitCode: 2,
        disposition: "incremental-readiness",
        profileId: "readiness",
        selectedByOverride: false,
        candidateCommit: f.value.candidate.gitCommit,
        candidateTree: f.value.candidate.gitTree,
        executionProvider: f.value.executionProvider,
        resultSchemaVersion: SOURCE_AGGREGATE_SCHEMA_VERSION,
        scope,
      },
    },
  };
}

describe("source tier body decoder", () => {
  it("keeps full exact closure scoped and incomplete while sharing legacy body checks", () => {
    const f = fullSourceTierFixture();
    expect(
      validateSourceVerificationTierResult(f.value, f.expected).valid,
    ).toBe(true);
    expect(validateVerificationTierResult(f.value).valid).toBe(false);
    expect(
      validateSourceVerificationTierResult(
        {
          ...f.value,
          exactVerification: {
            ...f.value.exactVerification,
            resultSchemaVersion: "2.1.0",
          },
        },
        f.expected,
      ).valid,
    ).toBe(false);
    expect(
      validateSourceVerificationTierResult(f.value, {
        ...f.expected,
        qualifierRun: null,
      }).valid,
    ).toBe(false);
  });
  it("rejects substituted nested closure scope before its status can be interpreted", () => {
    const f = fullSourceTierFixture();
    expect(
      validateSourceVerificationTierResult(
        {
          ...f.value,
          exactVerification: {
            ...f.value.exactVerification,
            scope: {
              ...f.value.exactVerification.scope,
              contractId: "generated-adopter.v1",
            },
            get status() {
              throw new Error("Nested status interpreted before source scope");
            },
          },
        },
        f.expected,
      ),
    ).toMatchObject({
      valid: false,
      errors: ["Unknown or mixed source contract, epoch, or claim scope."],
    });
  });
  it("preserves source scope through the shared body decoder without admitting it as legacy or authenticating artifacts", () => {
    const f = sourceTierFixture();
    expect(
      validateSourceVerificationTierResult(f.value, f.expected),
    ).toMatchObject({ valid: true, value: f.value, errors: [] });
    expect(validateVerificationTierResult(f.value).valid).toBe(false);
    expect(f.value.completionEligible).toBe(false);
  });
  it("rejects mismatched dispatch scope before accessing status", () => {
    const f = sourceTierFixture();
    expect(
      validateSourceVerificationTierResult(
        {
          ...f.value,
          scope: { ...f.value.scope, authorityEpoch: "foreign" },
          get status() {
            throw new Error("status accessed");
          },
        },
        f.expected,
      ),
    ).toMatchObject({
      valid: false,
      errors: ["Unknown or mixed source contract, epoch, or claim scope."],
    });
  });
  const malformed: readonly [
    string,
    (value: ReturnType<typeof sourceTierFixture>["value"]) => unknown,
  ][] = [
    ["completion claim", (value) => ({ ...value, completionEligible: true })],
    [
      "missing command receipt",
      (value) => ({
        ...value,
        commands: [
          {
            ...value.commands[0],
            receipt: null,
            receiptAbsenceReason: "missing",
          },
        ],
      }),
    ],
    [
      "failed child",
      (value) => ({
        ...value,
        commands: [{ ...value.commands[0], status: "FAIL", exitCode: 1 }],
      }),
    ],
    [
      "foreign candidate",
      (value) => ({
        ...value,
        candidateFinal: { ...value.candidateFinal, gitCommit: "f".repeat(40) },
      }),
    ],
    ["unknown field", (value) => ({ ...value, untrustedOverride: true })],
    ["wrong exit", (value) => ({ ...value, exitCode: 2 })],
  ];
  it.each(malformed)(
    "rejects %s in an otherwise valid source body",
    (_name, mutate) => {
      const f = sourceTierFixture();
      const value = mutate(f.value);
      expect(
        validateSourceVerificationTierResult(value, f.expected).valid,
      ).toBe(false);
    },
  );
  it("retains the exact 65-minute partition deadline and argv requirement", () => {
    const f = sourceTierFixture();
    const value = structuredClone(f.value);
    const command = {
      ...value.commands[0]!,
      id: "test-partition-controller-runtime",
      argv: ["pnpm", "test:partition:controller-runtime"],
      timeoutMs: 65 * 60 * 1000,
    };
    value.commands = [command];
    expect(validateSourceVerificationTierResult(value, f.expected).valid).toBe(
      true,
    );
    command.timeoutMs -= 1;
    expect(validateSourceVerificationTierResult(value, f.expected).valid).toBe(
      false,
    );
  });
});

describe("explicit verification result scope", () => {
  it("refuses a legacy expected scope at the source tier facade before reading status", () => {
    const f = sourceTierFixture();
    const expected = {
      ...f.expected,
      scope: "legacy",
    } as unknown as SourceVerificationScopeExpectation;
    const result = validateSourceVerificationTierResult(
      {
        schemaVersion: "1.2.0",
        get status() {
          throw new Error("Status read before expected source scope");
        },
      },
      expected,
    );
    expect(result).toMatchObject({
      valid: false,
      errors: ["Source tier decoding requires a trusted tier scope."],
    });
  });
  it.each([
    ["aggregate", "2.1.0"],
    ["tier", "1.2.0"],
  ])(
    "retains the unchanged %s legacy schema without interpreting status",
    (kind, schemaVersion) => {
      expect(
        assertVerificationResultScope(
          {
            schemaVersion,
            get status() {
              throw new Error("Status accessed before scope");
            },
          },
          { kind, scope: "legacy" },
        ),
      ).toBeNull();
    },
  );
  it.each([
    "scope",
    "contractId",
    "authorityEpoch",
    "claimScope",
    "sourceCandidate",
    "fixtureCandidates",
    "qualifierRun",
    "purpose",
  ])("rejects legacy scope injection through %s before PASS", (key) => {
    expect(() =>
      assertVerificationResultScope(
        {
          schemaVersion: "2.1.0",
          [key]: null,
          get status() {
            throw new Error("Status accessed before scope");
          },
        },
        { kind: "aggregate", scope: "legacy" },
      ),
    ).toThrow(/scope fields/);
  });
  it("requires caller-owned scope and does not infer it from a claimed PASS", () => {
    const f = fixture();
    expect(() => assertVerificationResultScope(f.value, {})).toThrow(
      /trusted expected/,
    );
    expect(() =>
      assertVerificationResultScope(f.value, {
        ...f.expected,
        scope: "legacy",
      }),
    ).toThrow(/cross-scope/);
    expect(() =>
      assertVerificationResultScope(
        { ...f.value, schemaVersion: "2.1.0" },
        f.expected,
      ),
    ).toThrow(/cross-scope/);
    expect(() =>
      assertVerificationResultScope(
        { ...f.value, schemaVersion: "9.0.0" },
        f.expected,
      ),
    ).toThrow(/cross-scope/);
  });
  it("checks exact source, fixture and independently observed qualifier bindings without supplying an outcome", () => {
    const f = fixture();
    expect(
      assertVerificationResultScope(
        {
          ...f.value,
          get status() {
            throw new Error("No status authority");
          },
        },
        f.expected,
      ),
    ).toEqual(f.value.scope);
    expect(
      assertVerificationResultScope(
        { ...f.value, schemaVersion: SOURCE_TIER_SCHEMA_VERSION },
        { ...f.expected, kind: "tier" },
      ),
    ).toEqual(f.value.scope);
    expect(Object.hasOwn(f.value.scope, "completionEligible")).toBe(false);
  });
  it.each(["contractId", "authorityEpoch", "claimScope"])(
    "rejects unknown source %s",
    (key) => {
      const f = fixture();
      expect(() =>
        assertVerificationResultScope(
          { ...f.value, scope: { ...f.value.scope, [key]: "unknown" } },
          f.expected,
        ),
      ).toThrow(/Unknown or mixed/);
    },
  );
  it("rejects candidate/full-purpose substitution even for the same exact source", () => {
    const f = fixture();
    expect(() =>
      assertVerificationResultScope(f.value, {
        ...f.expected,
        purpose: "full-source-qualification",
      }),
    ).toThrow(/trusted dispatch/);
    expect(() =>
      assertVerificationResultScope(
        {
          ...f.value,
          scope: { ...f.value.scope, purpose: "full-source-qualification" },
        },
        f.expected,
      ),
    ).toThrow(/trusted dispatch/);
  });
  it("rejects stale source, fixture, qualifier and nonce identities", () => {
    const f = fixture();
    expect(() =>
      assertVerificationResultScope(f.value, {
        ...f.expected,
        sourceCandidate: {
          ...f.expected.sourceCandidate,
          gitTree: "9".repeat(40),
        },
      }),
    ).toThrow(/expected\/result identity/);
    expect(() =>
      assertVerificationResultScope(
        {
          ...f.value,
          candidate: { ...f.value.candidate, workingTreeDirty: true },
        },
        f.expected,
      ),
    ).toThrow(/expected\/result identity/);
    expect(() =>
      assertVerificationResultScope(f.value, {
        ...f.expected,
        fixtureCandidates: [],
      }),
    ).toThrow(/fixture inventory/);
    expect(() =>
      assertVerificationResultScope(f.value, {
        ...f.expected,
        qualifierRun: { ...f.expected.qualifierRun, nonce: "7".repeat(64) },
      }),
    ).toThrow(/independently observed/);
    expect(() =>
      assertVerificationResultScope(f.value, {
        ...f.expected,
        qualifierRun: null,
      }),
    ).toThrow(/independently observed/);
  });
  it("requires explicit qualifier absence and accepts semantic fixture identity regardless of JSON key ordering", () => {
    const f = fixture();
    const value = {
      ...f.value,
      scope: { ...f.value.scope, qualifierRun: null },
    };
    const expected = { ...f.expected, qualifierRun: null };
    expect(assertVerificationResultScope(value, expected)).toEqual(value.scope);
    const { qualifierRun: omitted, ...missing } = expected;
    expect(omitted).toBeNull();
    expect(() => assertVerificationResultScope(value, missing)).toThrow(
      /explicitly bind/,
    );
    const item = f.expected.fixtureCandidates[0]!;
    expect(
      assertVerificationResultScope(f.value, {
        ...f.expected,
        fixtureCandidates: [
          {
            candidate: item.candidate,
            authorityEpoch: item.authorityEpoch,
            contractId: item.contractId,
            id: item.id,
          },
        ],
      }),
    ).toEqual(f.value.scope);
  });
  it("rejects omitted scope fields, duplicated fixtures and source authority leaking into an adopter", () => {
    const f = fixture();
    const { fixtureCandidates: omitted, ...missing } = f.value.scope;
    expect(omitted).toHaveLength(1);
    expect(() =>
      assertVerificationResultScope({ ...f.value, scope: missing }, f.expected),
    ).toThrow(/unknown or missing/);
    expect(() =>
      assertVerificationResultScope(
        {
          ...f.value,
          scope: {
            ...f.value.scope,
            fixtureCandidates: [...omitted, ...omitted],
          },
        },
        f.expected,
      ),
    ).toThrow(/duplicated/);
    expect(() =>
      assertVerificationResultScope(
        {
          ...f.value,
          scope: {
            ...f.value.scope,
            fixtureCandidates: [
              { ...omitted[0], contractId: SOURCE_CONTRACT_ID },
            ],
          },
        },
        f.expected,
      ),
    ).toThrow(/imports source/);
  });
  it("makes the real legacy tier decoder refuse source before its status getter can run", () => {
    const value = {
      schemaVersion: SOURCE_TIER_SCHEMA_VERSION,
      get status() {
        throw new Error("Status evaluated before scope");
      },
    };
    expect(validateVerificationTierResult(value)).toMatchObject({
      valid: false,
      errors: ["Unknown or cross-scope verification result schema."],
    });
  });
  it("makes the real authoritative reader reject a claimed source PASS at its scope boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "verification-scope-"));
    try {
      const path = join(root, "result.json");
      await writeFile(
        path,
        JSON.stringify({
          schemaVersion: SOURCE_AGGREGATE_SCHEMA_VERSION,
          status: "PASS",
        }),
      );
      await expect(
        parseAuthoritativeVerification({
          workspacePath: root,
          expectedCommit: "1".repeat(40),
          expectedRunId: "scope-rejection",
          observedExitCode: 0,
          resultPath: path,
          copiedResultPath: path,
          expectedExecutionProvider: unattestedExecutionProviderIdentity(
            null,
            process.version,
          ),
        }),
      ).rejects.toThrow(/cross-scope/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("retains the approved eleven source stage identities separately from legacy and requires consumed build artifacts", async () => {
    const proposed = JSON.parse(
      await readFile(
        resolve(
          import.meta.dirname,
          "../../../docs/proposals/ORCH-AUTH-01-r2/proposed/source-command-contract.json",
        ),
        "utf8",
      ),
    );
    expect(SOURCE_VERIFICATION_STAGE_IDS).toEqual(
      proposed.sourceStages.map((stage: { id: string }) => stage.id),
    );
    expect(
      SOURCE_VERIFICATION_STAGES.find(
        ({ id }: { id: string }) => id === "production-build",
      )?.requiredArtifactKinds,
    ).toEqual([
      "build-report",
      "source-release-archive",
      "source-release-manifest",
      "source-release-consumer",
    ]);
    expect(SOURCE_VERIFICATION_STAGE_IDS).not.toContain("unit-domain");
    expect(Object.isFrozen(SOURCE_VERIFICATION_STAGES[0]?.scripts)).toBe(true);
  });
});
