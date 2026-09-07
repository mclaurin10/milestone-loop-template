import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkCodexGateway } from "./codex-gateway.js";
import {
  assertExecutingSourceImplementation,
  assertSourceReviewPermit,
  type SourceReviewPermit,
} from "./source-authority-review.js";
import { publishSourceAuthority } from "./source-authority-publication.js";
import { ControllerLease } from "./controller-lease.js";
import {
  inspectSourceDependencyCaptures,
  sourceDependencyReportVersion,
} from "./source-authority-audit-reports.mjs";
import { SOURCE_GENERATION_PATHS } from "./source-authority-generation.mjs";
import { runPnpm } from "../../evidence.mjs";
import {
  assertSourceReviewDecision,
  inspectSourceReviewEvidence,
  readSourceEvidenceReceipt,
  SOURCE_REVIEW_CHECK_IDS,
  SOURCE_REVIEW_PREFIX,
  sourceGit,
  sourceGitText,
  sourceHash,
  sourceIdentity,
  sourceHistoricalFiles,
  sourceCommittedRead,
} from "./source-authority-evidence.mjs";

const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
const serialize = (value: unknown) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n");

describe("source dependency reference evidence", () => {
  const sample = () => {
    const store = "/synthetic-store/v11";
    const references = {
      actual: "/synthetic-source",
      pristine: "/synthetic-temp/source-dependency-reference-fixture/pristine",
      built: "/synthetic-temp/source-dependency-reference-fixture/built",
    };
    const graph = [
      "pnpm",
      "list",
      "--recursive",
      "--depth",
      "Infinity",
      "--json",
    ];
    const rows: [string, string[], string][] = [
      ["exact-pnpm", ["pnpm", "--version"], references.actual],
      ["store-path", ["pnpm", "store", "path"], references.actual],
      ["installed-graph", graph, references.actual],
      [
        "pristine-install",
        [
          "pnpm",
          "install",
          "--frozen-lockfile",
          "--offline",
          "--ignore-scripts",
          "--side-effects-cache=false",
          "--package-import-method=copy",
          "--store-dir",
          store,
        ],
        references.pristine,
      ],
      ["store-integrity", ["pnpm", "store", "status"], references.pristine],
      [
        "reference-install",
        [
          "pnpm",
          "install",
          "--frozen-lockfile",
          "--offline",
          "--package-import-method=copy",
          "--store-dir",
          store,
        ],
        references.built,
      ],
      ["reference-graph", graph, references.built],
    ];
    const artifacts = new Map<string, Buffer>();
    const captures = rows.map(([id, argv, cwd]) => {
      const stdout =
        id === "store-integrity"
          ? Buffer.alloc(0)
          : Buffer.from("Synthetic reference record only\n");
      if (stdout.length) artifacts.set(id + ".stdout.log", stdout);
      return {
        id,
        argv: [...argv],
        cwd,
        exitCode: 0,
        stdoutPath: id + ".stdout.log",
        stderrPath: id + ".stderr.log",
        stdout: { bytes: stdout.length, sha256: sourceHash(stdout) },
        stderr: { bytes: 0, sha256: sourceHash(Buffer.alloc(0)) },
      };
    });
    return {
      report: {
        schemaVersion: "source-dependencies-report.v2",
        store,
        references,
        captures,
      },
      artifacts,
    };
  };
  it("binds pristine store checking separately from normal build output and explicit empty logs", () => {
    const { report, artifacts } = sample();
    expect(inspectSourceDependencyCaptures(report, artifacts)).toEqual(
      report.references,
    );
  });
  it.each([
    [
      "working-tree store check",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures[4]!.cwd = report.references.actual;
      },
    ],
    [
      "built-reference store check",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures[4]!.cwd = report.references.built;
      },
    ],
    [
      "skipped normal build",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures[5]!.argv.push("--ignore-scripts");
      },
    ],
    [
      "cached pristine build output",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures[3]!.argv = report.captures[3]!.argv.filter(
          (arg) => arg !== "--side-effects-cache=false",
        );
      },
    ],
    [
      "failed store integrity",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures[4]!.exitCode = 1;
      },
    ],
    [
      "missing pristine installation",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures.splice(3, 1);
      },
    ],
    [
      "changed raw log",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures[0]!.stdout.sha256 = "0".repeat(64);
      },
    ],
    [
      "missing nonempty stderr",
      (report: ReturnType<typeof sample>["report"]) => {
        report.captures[4]!.stderr.bytes = 1;
      },
    ],
    [
      "shared actual/reference root",
      (report: ReturnType<typeof sample>["report"]) => {
        report.references.actual = report.references.built;
      },
    ],
  ] as const)(
    "rejects %s without accepting an exit-zero assertion",
    (_name, mutate) => {
      const { report, artifacts } = sample();
      mutate(report);
      expect(() =>
        inspectSourceDependencyCaptures(report, artifacts),
      ).toThrow();
    },
  );
  it("limits v1 interpretation to the exact historical implementation bytes", () => {
    const repository = resolve(import.meta.dirname, "../../..");
    const path = "tools/source-release-inspection.mjs";
    const historical = sourceGit(repository, [
      "show",
      "fc2419d8bdfc3658fe76edf2b543b38051b359f1:" + path,
    ]);
    expect(sourceDependencyReportVersion(new Map([[path, historical]]))).toBe(
      "source-dependencies-report.v1",
    );
    expect(
      sourceDependencyReportVersion(
        new Map([
          [
            path,
            Buffer.concat([
              historical,
              Buffer.from("\n// changed implementation\n"),
            ]),
          ],
        ]),
      ),
    ).toBe("source-dependencies-report.v2");
  });
});

describe("source Git operation environment", () => {
  it.each([
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
  ])("refuses redirecting %s before invoking Git", async (name) => {
    const root = await fixture();
    const prior = process.env[name];
    const before = sourceGitText(root, "for-each-ref", "--format=%(refname)");
    try {
      process.env[name] = "source-fixture-redirection";
      expect(() => sourceGitText(root, "rev-parse", "--git-dir")).toThrow(
        "redirecting Git environment: " + name,
      );
    } finally {
      if (prior === undefined) delete process.env[name];
      else process.env[name] = prior;
    }
    expect(sourceGitText(root, "for-each-ref", "--format=%(refname)")).toBe(
      before,
    );
  });
});
async function fixture() {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), "source-evidence-test-")),
  );
  temporary.push(root);
  sourceGit(root, ["init", "--initial-branch=master"]);
  sourceGit(root, ["config", "user.name", "Source evidence fixture"]);
  sourceGit(root, ["config", "user.email", "source-evidence@example.invalid"]);
  sourceGit(root, ["config", "commit.gpgsign", "false"]);
  return root;
}

describe("operation-local source Git observations", () => {
  it("independently observes each historical batch while committed reads still reject changed live bytes", async () => {
    const root = await fixture();
    const original = Buffer.from([0, 10, 13, 255, 10]);
    await write(root, "one.bin", original);
    await write(root, "two.bin", original);
    sourceGit(root, ["add", "."]);
    sourceGit(root, ["commit", "-m", "Synthetic binary observation fixture"]);
    const before = sourceIdentity(root, true);
    const observed = sourceHistoricalFiles(root, before.commit, [
      "one.bin",
      "two.bin",
    ]);
    expect([...observed.keys()]).toEqual(["one.bin", "two.bin"]);
    expect(observed.get("one.bin")).toEqual(original);
    observed.get("one.bin")![0] = 9;
    expect(observed.get("two.bin")).toEqual(original);
    await write(root, "one.bin", Buffer.from("Synthetic later live bytes\n"));
    expect(
      sourceHistoricalFiles(root, before.commit, ["one.bin"]).get("one.bin"),
    ).toEqual(original);
    await expect(
      sourceCommittedRead(root, before.commit, "one.bin"),
    ).rejects.toThrow("changed after its committed observation");
    expect(sourceIdentity(root)).toEqual(before);
  });
  it("requires an attached branch when observing commit and tree in one Git invocation", async () => {
    const root = await fixture();
    await write(
      root,
      "fixture.txt",
      Buffer.from("Synthetic identity fixture\n"),
    );
    sourceGit(root, ["add", "."]);
    sourceGit(root, ["commit", "-m", "Synthetic identity observation"]);
    sourceGit(root, ["checkout", "-b", "codex/source-observation"]);
    const identity = sourceIdentity(root, true);
    expect(identity).toEqual({
      commit: sourceGitText(root, "rev-parse", "HEAD"),
      tree: sourceGitText(root, "rev-parse", "HEAD^{tree}"),
      branch: "codex/source-observation",
    });
    sourceGit(root, ["checkout", "--detach", identity.commit]);
    expect(() => sourceIdentity(root)).toThrow("attached HEAD");
  });
});
async function write(root: string, path: string, bytes: Uint8Array) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), bytes);
}
async function receipt(
  root: string,
  prefix: string,
  files: { path: string; kind: string; contents: Buffer }[],
  stageId = "test-source-evidence",
  commandId = "test-source-evidence",
) {
  for (const file of files)
    await write(root, prefix + file.path, file.contents);
  const value = {
    schemaVersion: "1.0.0",
    stageId,
    commandId,
    status: "PASS",
    checks: [
      {
        id: "synthetic-fixture",
        status: "PASS",
        summary: "Synthetic unit fixture; no actual SDK or publication claim.",
      },
    ],
    artifacts: files.map(({ path, kind, contents }) => ({
      path,
      kind,
      bytes: contents.length,
      sha256: sourceHash(contents),
    })),
  };
  await write(root, prefix + "result.json", serialize(value));
  sourceGit(root, ["add", "."]);
  sourceGit(root, ["commit", "-m", "commit synthetic source evidence fixture"]);
  return sourceGitText(root, "rev-parse", "HEAD");
}
const binding = {
  requestCommit: "a".repeat(40),
  requestSha256: "b".repeat(64),
  subjectSha256: "c".repeat(64),
  implementation: {
    commit: "d".repeat(40),
    tree: "e".repeat(40),
    branch: "master",
  },
};
function decision() {
  return {
    requestCommit: binding.requestCommit,
    requestSha256: binding.requestSha256,
    subjectSha256: binding.subjectSha256,
    implementationCommit: binding.implementation.commit,
    decision: "approve",
    checks: SOURCE_REVIEW_CHECK_IDS.map((id) => ({
      id,
      passed: true,
      evidence: "Synthetic fixture assertion for " + id,
    })),
    findings: [] as { severity: string; description: string }[],
  };
}
interface FixtureEvent {
  type: string;
  thread_id?: string;
  item?: { type: string; text: string };
  usage?: { input_tokens: number; output_tokens: number };
  message?: string;
}
async function reviewFixture(
  mutate?: (data: {
    review: ReturnType<typeof decision>;
    events: FixtureEvent[];
    invocation: { status: string };
  }) => void,
) {
  const root = await fixture(),
    review = decision();
  const invocation = {
    id: "synthetic-invocation",
    role: "reviewer",
    threadId: "synthetic-thread",
    status: "completed",
    attempt: 1,
    escalated: false,
    error: null,
    startedAt: "2026-09-06T00:00:00Z",
    finishedAt: "2026-09-06T00:01:00Z",
  };
  const events: FixtureEvent[] = [
    { type: "thread.started", thread_id: "synthetic-thread" },
    {
      type: "item.completed",
      item: { type: "agent_message", text: JSON.stringify(review) },
    },
    { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
  ];
  mutate?.({ review, events, invocation });
  const report = {
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
      threadId: "synthetic-thread",
      invocationId: "synthetic-invocation",
    },
  };
  const commit = await receipt(
    root,
    SOURCE_REVIEW_PREFIX,
    [
      {
        path: "review.json",
        kind: "source-authority-review",
        contents: serialize(report),
      },
      {
        path: "agent-invocation.json",
        kind: "source-authority-reviewer-invocation",
        contents: serialize(invocation),
      },
      {
        path: "reviewer-events.jsonl",
        kind: "source-authority-reviewer-events",
        contents: Buffer.from(
          events.map((event) => JSON.stringify(event)).join("\n") + "\n",
        ),
      },
      {
        path: "reviewer-prompt.txt",
        kind: "source-authority-review-prompt",
        contents: Buffer.from(
          [
            binding.requestCommit,
            binding.requestSha256,
            binding.subjectSha256,
            binding.implementation.commit,
          ].join("\n"),
        ),
      },
    ],
    "source-authority-review",
    "source-authority-review",
  );
  return { root, commit };
}

describe("native source authority evidence reader", () => {
  it("loads the complete source reader and approved snapshot through native Node", async () => {
    const script = `await import('./tools/milestone-orchestrator/src/source-authority-generation.mjs');
const { inspectSourceEpochSnapshot } = await import('./tools/milestone-orchestrator/src/source-epoch-snapshot.ts');
const value = await inspectSourceEpochSnapshot({ repositoryRoot: process.cwd(), snapshotCommit: '91cbd3eb75ec771cfa1f315fe2641488e361c9e0' });
if (!value.strictAncestor || value.files.length !== 12) throw new Error('Missing actual approved snapshot');
process.stdout.write('native-source-reader-inspected');`;
    const result = await runPnpm(
      ["exec", "node", "--input-type=module", "--eval", script],
      { timeoutMs: 60_000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("native-source-reader-inspected");
  }, 70_000);

  it("checks committed regular receipt bytes and independently hashes each artifact", async () => {
    const root = await fixture();
    const commit = await receipt(root, "evidence/", [
      {
        path: "report.json",
        kind: "synthetic-report",
        contents: serialize({ observations: 1 }),
      },
    ]);
    const value = await readSourceEvidenceReceipt(
      root,
      "evidence/",
      {
        stageId: "test-source-evidence",
        commandId: "test-source-evidence",
        requiredKinds: ["synthetic-report"],
      },
      commit,
    );
    expect(value.artifacts.size).toBe(1);
    expect(value.sha256).toBe(
      sourceHash(await readFile(resolve(root, "evidence/result.json"))),
    );
    await write(root, "evidence/report.json", serialize({ observations: 2 }));
    await expect(
      readSourceEvidenceReceipt(
        root,
        "evidence/",
        { stageId: "test-source-evidence", commandId: "test-source-evidence" },
        commit,
      ),
    ).rejects.toThrow(/changed after/);
  });
  it("reads distinct binary paths sharing one Git blob and still rejects a changed live file", async () => {
    const root = await fixture();
    const contents = Buffer.from([0, 255, 10, 13, 0, 128, 65, 10]);
    const commit = await receipt(root, "evidence/", [
      { path: "first.bin", kind: "binary-first", contents },
      { path: "second.bin", kind: "binary-second", contents },
    ]);
    expect(
      sourceGitText(root, "rev-parse", commit + ":evidence/first.bin"),
    ).toBe(sourceGitText(root, "rev-parse", commit + ":evidence/second.bin"));
    const expected = {
      stageId: "test-source-evidence",
      commandId: "test-source-evidence",
    };
    const value = await readSourceEvidenceReceipt(
      root,
      "evidence/",
      expected,
      commit,
    );
    expect(value.artifacts.size).toBe(2);
    expect(value.artifacts.get("first.bin").contents).toEqual(contents);
    expect(value.artifacts.get("second.bin").contents).toEqual(contents);
    await write(
      root,
      "evidence/second.bin",
      Buffer.from([0, 254, 10, 13, 0, 128, 65, 10]),
    );
    await expect(
      readSourceEvidenceReceipt(root, "evidence/", expected, commit),
    ).rejects.toThrow(/changed after/);
    expect(await readFile(resolve(root, "evidence/first.bin"))).toEqual(
      contents,
    );
  });
  it("rejects corrupt bytes under an actual Git blob identity even when the working receipt matches them", async () => {
    const root = await fixture();
    const commit = await receipt(root, "evidence/", [
      {
        path: "report.json",
        kind: "synthetic-report",
        contents: serialize({ observations: 1 }),
      },
    ]);
    const oid = sourceGitText(
      root,
      "rev-parse",
      commit + ":evidence/result.json",
    );
    expect(oid).toMatch(/^[a-f0-9]{40}$/);
    // This fixture owns its empty-initialized Git database; no shared/alternate
    // object store is involved. Corrupt only its disposable receipt object.
    expect(await realpath(resolve(root, ".git/objects"))).toBe(
      resolve(root, ".git/objects"),
    );
    const altered = Buffer.concat([
      await readFile(resolve(root, "evidence/result.json")),
      Buffer.from("\n"),
    ]);
    const ownedObject = resolve(
      root,
      ".git/objects",
      oid.slice(0, 2),
      oid.slice(2),
    );
    expect(await realpath(ownedObject)).toBe(ownedObject);
    await chmod(ownedObject, 0o600);
    await writeFile(
      ownedObject,
      deflateSync(
        Buffer.concat([Buffer.from(`blob ${altered.length}\0`), altered]),
      ),
    );
    await write(root, "evidence/result.json", altered);
    await expect(
      readSourceEvidenceReceipt(
        root,
        "evidence/",
        {
          stageId: "test-source-evidence",
          commandId: "test-source-evidence",
        },
        commit,
      ),
    ).rejects.toThrow(/actual blob identity/);
  });
  it.each(["stage", "command", "kind"])(
    "refuses a receipt with the wrong expected %s",
    async (field) => {
      const root = await fixture();
      const commit = await receipt(root, "evidence/", [
        {
          path: "report.json",
          kind: "synthetic-report",
          contents: serialize({ observations: 1 }),
        },
      ]);
      await expect(
        readSourceEvidenceReceipt(
          root,
          "evidence/",
          {
            stageId: field === "stage" ? "foreign" : "test-source-evidence",
            commandId: field === "command" ? "foreign" : "test-source-evidence",
            requiredKinds: [field === "kind" ? "foreign" : "synthetic-report"],
          },
          commit,
        ),
      ).rejects.toThrow();
    },
  );
  it("refuses a self-authored approval field even when the ordinary receipt checks pass", async () => {
    const root = await fixture();
    await receipt(root, "evidence/", [
      {
        path: "report.json",
        kind: "synthetic-report",
        contents: serialize({ observations: 1 }),
      },
    ]);
    const value = JSON.parse(
      await readFile(resolve(root, "evidence/result.json"), "utf8"),
    );
    value.publicationAuthorized = true;
    await write(root, "evidence/result.json", serialize(value));
    await expect(
      readSourceEvidenceReceipt(root, "evidence/", {
        stageId: "test-source-evidence",
        commandId: "test-source-evidence",
      }),
    ).rejects.toThrow(/unknown or missing/);
  });
  it("reads a committed synthetic reviewer transcript without issuing publication authority", async () => {
    const { root, commit } = await reviewFixture();
    const value = await inspectSourceReviewEvidence(root, binding, commit);
    expect(value.report.review.decision).toBe("approve");
    expect(value.report.completionEligible).toBe(false);
    expect(value).not.toHaveProperty("publicationAuthorized");
  });
  it.each([
    "reject",
    "failed check",
    "duplicate check",
    "high finding",
    "wrong request",
    "wrong thread",
    "missing events",
    "error event",
    "different final response",
    "unfinished invocation",
  ])(
    "refuses internally invalid committed review evidence: %s",
    async (fault) => {
      const { root, commit } = await reviewFixture(
        ({ review, events, invocation }) => {
          if (fault === "reject") review.decision = "reject";
          if (fault === "failed check") review.checks[0]!.passed = false;
          if (fault === "duplicate check")
            review.checks[0]!.id = review.checks[1]!.id;
          if (fault === "high finding")
            review.findings.push({
              severity: "high",
              description: "missing integrity evidence",
            });
          if (fault === "wrong request") review.requestCommit = "f".repeat(40);
          if (fault === "wrong thread")
            events[0]!["thread_id"] = "foreign-thread";
          if (fault === "missing events") events.splice(0);
          if (fault === "error event")
            events.push({ type: "error", message: "review failed" });
          if (fault === "different final response")
            events[1]!.item!.text = JSON.stringify({
              ...review,
              decision: "reject",
            });
          if (fault === "unfinished invocation")
            invocation["status"] = "starting";
        },
      );
      await expect(
        inspectSourceReviewEvidence(root, binding, commit),
      ).rejects.toThrow();
    },
  );
  it("rejects an unknown reviewer check instead of relying on decision alone", () => {
    const review = decision();
    review.checks.push({
      id: "arbitrary",
      passed: true,
      evidence: "self-authored approval",
    });
    expect(() => assertSourceReviewDecision(review, binding)).toThrow();
  });
  it.each([
    "plain metadata",
    "serialized approval",
    "gateway-labelled transcript",
  ])(
    "refuses a forged %s permit before taking any lease or invoking the SDK",
    async (kind) => {
      const root = await fixture();
      const gateway = vi.spyOn(SdkCodexGateway.prototype, "run");
      const permit = JSON.parse(
        JSON.stringify({
          kind,
          gateway: "SdkCodexGateway",
          review: decision(),
          publicationAuthorized: true,
        }),
      ) as SourceReviewPermit;
      const request = {
        commit: binding.requestCommit,
        sha256: binding.requestSha256,
      };
      await expect(
        assertSourceReviewPermit(permit, root, request),
      ).rejects.toThrow(/live permit/);
      await expect(
        publishSourceAuthority({
          repositoryRoot: root,
          request,
          reviewPermit: permit,
        }),
      ).rejects.toThrow(/live permit/);
      await expect(
        ControllerLease.acquire({
          repositoryRoot: root,
          statePath: "artifacts/orchestrator/state/state.json",
          operation: "authority-migrate",
          sourceAuthorityRequest: request,
          sourceReviewPermit: permit,
        }),
      ).rejects.toThrow(/live permit/);
      expect(
        sourceGitText(
          root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
      expect(gateway).not.toHaveBeenCalled();
    },
  );
  it("compares captured executing source bytes to real implementation blobs and refuses a different committed implementation", async () => {
    const root = await fixture(),
      controller = resolve(import.meta.dirname, "../../..");
    const policyPath = "tools/source-release-policy.json";
    const policy = JSON.parse(
      await readFile(resolve(controller, policyPath), "utf8"),
    );
    for (const path of [
      policyPath,
      ...policy.payloadFiles.filter(
        (path: string) => !SOURCE_GENERATION_PATHS.includes(path),
      ),
    ])
      await write(root, path, await readFile(resolve(controller, path)));
    sourceGit(root, ["add", "."]);
    sourceGit(root, [
      "commit",
      "-m",
      "Commit real copied controller bytes for code identity fixture",
    ]);
    const commit = sourceGitText(root, "rev-parse", "HEAD");
    await expect(
      assertExecutingSourceImplementation(root, commit),
    ).resolves.toMatch(/^[a-f0-9]{64}$/);
    await write(
      root,
      "tools/milestone-orchestrator/src/source-authority-review.ts",
      Buffer.from("// Foreign implementation fixture\n"),
    );
    sourceGit(root, ["add", "."]);
    sourceGit(root, [
      "commit",
      "-m",
      "Commit a distinct controller implementation",
    ]);
    await expect(
      assertExecutingSourceImplementation(
        root,
        sourceGitText(root, "rev-parse", "HEAD"),
      ),
    ).rejects.toThrow(/Executing source differs/);
    // A different descendant cannot rewrite the immutable reviewed Git objects.
    await expect(
      assertExecutingSourceImplementation(root, commit),
    ).resolves.toMatch(/^[a-f0-9]{64}$/);
  }, 60_000);
});
