import { createHash, randomUUID } from "node:crypto";
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
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runPnpm } from "../../evidence.mjs";
import {
  assertActiveAuthorityPublication,
  AUTHORITY_MIGRATION_PENDING_PATH,
  SOURCE_AUTHORITY_PUBLICATION_PATH,
  SOURCE_AUTHORITY_REQUEST_PATH,
} from "./authority-publication.mjs";
import {
  prepareSourceAuthorityTransition,
  createSourceAuthorityRequestBinding,
  inspectCommittedSourceAuthorityRequestBinding,
  inspectSourceAuthorityRequestForReview,
  SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
  SOURCE_TRANSITION_COMMANDS,
  SOURCE_TRANSITION_OUTPUT_PATHS,
  SOURCE_TRANSITION_MANIFEST_PATH,
  SOURCE_TRANSITION_INPUT_PATH,
  SOURCE_TRANSITION_POLICY_PATH,
  LEGACY_AMENDMENT_LEDGER_PATH,
} from "./source-authority-transition.js";
import {
  SOURCE_APPROVAL_PATH,
  SOURCE_CONTRACT_ID,
  SOURCE_SNAPSHOT_ROOT_FILES,
  SOURCE_SNAPSHOT_PREFIX,
} from "./source-epoch-snapshot.js";
import {
  PARTITION_COMMANDS,
  focusedCommandTimeout,
} from "./source-schedule.js";
import {
  assertVerificationManifest,
  assertVerificationScopePolicy,
} from "./schema.js";
import { validateCommandReceiptDirectory } from "./verifier.js";
import { canonicalJson } from "./package-graph.js";

const controller = resolve(import.meta.dirname, "../../..");
// A fixed real legacy source commit keeps this pre-publication fixture's meaning
// when the source repository later activates the approved new epoch.
const BASE = "ab19211e3663acc7b14acc847bdc3dde11414d19";
const SNAPSHOT = "91cbd3eb75ec771cfa1f315fe2641488e361c9e0";
const temporary: string[] = [];
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
function git(root: string, ...args: string[]) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr);
  return result.stdout.trim();
}
async function fixture() {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), "source-transition-test-")),
  );
  temporary.push(root);
  git(
    controller,
    "clone",
    "--shared",
    "--no-checkout",
    "--single-branch",
    controller,
    root,
  );
  // This is fixture setup in the newly created empty clone, before inspection.
  git(root, "checkout", "--quiet", "-B", "master", BASE);
  git(root, "remote", "remove", "origin");
  git(root, "config", "user.name", "Source Transition Fixture");
  git(root, "config", "user.email", "source-transition@example.invalid");
  return root;
}
async function committedChange(root: string, path: string, contents: string) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), contents);
  git(root, "add", "--", path);
  git(root, "commit", "--quiet", "-m", "Transition rejection fixture");
}
afterEach(async () => {
  for (const root of temporary.splice(0))
    await rm(root, { recursive: true, force: true });
});
const prepare = (root: string, snapshotCommit = SNAPSHOT) =>
  prepareSourceAuthorityTransition({ repositoryRoot: root, snapshotCommit });

describe(
  "exact source authority transition projection",
  { timeout: 120_000 },
  () => {
    it("reproduces twelve exact approved outputs while preserving every live authority and the complete ledger", async () => {
      const root = await fixture();
      const first = await prepare(root),
        second = await prepare(root);
      expect(first).toEqual(second);
      expect(first).toMatchObject({
        status: "PASS",
        publicationAuthorized: false,
        implementationAuditAuthenticated: false,
        independentReviewAuthenticated: false,
        completionEligible: false,
        subject: {
          implementation: { commit: BASE, branch: "master" },
          canonicalState: { exists: false },
        },
      });
      expect(first.files.map((file) => file.path)).toEqual(
        SOURCE_TRANSITION_OUTPUT_PATHS,
      );
      expect(first.files).toHaveLength(12);
      for (const path of SOURCE_SNAPSHOT_ROOT_FILES) {
        const expected = git(
          root,
          "show",
          `${SNAPSHOT}:${SOURCE_SNAPSHOT_PREFIX}/${path}`,
        );
        expect(
          first.files
            .find((file) => file.path === path)!
            .contents.toString()
            .trim(),
        ).toBe(expected);
      }
      const proposed = JSON.parse(
        first.files
          .find((file) => file.path === SOURCE_AUTHORITY_PUBLICATION_PATH)!
          .contents.toString(),
      );
      expect(proposed.entries).toHaveLength(1);
      expect(proposed.entries[0].requestSubjectSha256).toBe(
        first.subjectSha256,
      );
      expect(proposed.entries[0].priorCommissioning.ledgerSha256).toBe(
        hash(await readFile(resolve(root, LEGACY_AMENDMENT_LEDGER_PATH))),
      );
      expect(
        proposed.entries[0].priorCommissioning.ledgerHistory.length,
      ).toBeGreaterThan(0);
      expect(
        git(root, "status", "--porcelain=v1", "--untracked-files=all"),
      ).toBe("");
      expect(git(root, "rev-parse", "HEAD")).toBe(BASE);
      expect(
        git(
          root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
      expect(existsSync(resolve(root, SOURCE_AUTHORITY_PUBLICATION_PATH))).toBe(
        false,
      );
      expect(await assertActiveAuthorityPublication(root)).toBe("legacy");
    });
    it("builds the canonical source floor with unchanged four-owner order and 65-minute command binding", async () => {
      const projection = await prepare(await fixture());
      const manifest = assertVerificationManifest(
        JSON.parse(
          projection.files
            .find((file) => file.path === SOURCE_TRANSITION_MANIFEST_PATH)!
            .contents.toString(),
        ),
      );
      expect(manifest.commissioning.id).toBe(SOURCE_CONTRACT_ID);
      expect(manifest.focusedCommands).toEqual(SOURCE_TRANSITION_COMMANDS);
      expect(manifest.focusedCommands[0]!.id).toBe("test-invariants");
      expect(manifest.focusedCommands.slice(-4)).toEqual(PARTITION_COMMANDS);
      expect(
        manifest.focusedCommands.slice(-4).map(focusedCommandTimeout),
      ).toEqual([3_900_000, 3_900_000, 3_900_000, 3_900_000]);
      expect(manifest.exactVerification.argv).toEqual(["pnpm", "verify"]);
      expect(
        manifest.focusedCommands.some((command) =>
          [
            "test-unit",
            "test-unit-fast",
            "test-unit-migrations",
            "test-orchestrator",
          ].includes(command.id),
        ),
      ).toBe(false);
      const policy = assertVerificationScopePolicy(
        JSON.parse(
          projection.files
            .find((file) => file.path === SOURCE_TRANSITION_POLICY_PATH)!
            .contents.toString(),
        ),
      );
      expect(policy.closureSuppressionAllowed).toBe(false);
      expect(policy.unknownDisposition).toBe("fail-broad");
      expect(
        Object.values(policy.mandatoryChecks).every(
          (checks) =>
            JSON.stringify(checks) ===
            JSON.stringify(
              SOURCE_TRANSITION_COMMANDS.map((command) => command.id),
            ),
        ),
      ).toBe(true);
    });
    it("records existing fixture state exactly without reading it as an adopted controller state", async () => {
      const root = await fixture(),
        path = resolve(root, "artifacts/orchestrator/state/state.json");
      await mkdir(dirname(path), { recursive: true });
      const contents = Buffer.from(
        '{"fixture":"legacy-state-preserved","verifiedCommit":"' +
          BASE +
          '"}\n',
      );
      await writeFile(path, contents);
      const projection = await prepare(root);
      expect(projection.subject.canonicalState).toMatchObject({
        exists: true,
        bytes: contents.length,
        sha256: hash(contents),
      });
      expect(await readFile(path)).toEqual(contents);
      expect(projection.publicationAuthorized).toBe(false);
      expect(
        git(
          root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
    });
    it.each(["tracked", "staged", "untracked"])(
      "rejects a %s dirty input",
      async (kind) => {
        const root = await fixture(),
          path = kind === "untracked" ? "untracked-fixture.txt" : "README.md";
        await writeFile(resolve(root, path), "dirty\n");
        if (kind === "staged") git(root, "add", "--", path);
        await expect(prepare(root)).rejects.toThrow("clean committed checkout");
      },
    );
    it("rejects a detached input before building outputs", async () => {
      const root = await fixture();
      git(root, "checkout", "--quiet", "--detach", BASE);
      await expect(prepare(root)).rejects.toThrow();
    });
    it("rejects a same-commit snapshot", async () => {
      const root = await fixture();
      await expect(prepare(root, BASE)).rejects.toThrow("strict ancestor");
    });
    it("rejects an actual non-ancestor commit", async () => {
      const root = await fixture(),
        commit = git(
          root,
          "commit-tree",
          git(root, "rev-parse", "HEAD^{tree}"),
          "-p",
          BASE,
          "-m",
          "Unselected descendant",
        );
      await expect(prepare(root, commit)).rejects.toThrow(
        "not in the current candidate",
      );
    });
    it("rejects a changed committed approval record", async () => {
      const root = await fixture();
      await committedChange(
        root,
        SOURCE_APPROVAL_PATH,
        '{"status":"APPROVED"}\n',
      );
      await expect(prepare(root)).rejects.toThrow();
    });
    it("rejects a changed committed legacy goal without regenerating its lock", async () => {
      const root = await fixture();
      await committedChange(root, "PROJECT_GOAL.md", "unauthorized scope\n");
      await expect(prepare(root)).rejects.toThrow(
        "Original legacy authority differs",
      );
    });
    it("rejects a rewritten committed amendment prefix", async () => {
      const root = await fixture(),
        value = JSON.parse(
          await readFile(resolve(root, LEGACY_AMENDMENT_LEDGER_PATH), "utf8"),
        );
      value.entries = [];
      await committedChange(
        root,
        LEGACY_AMENDMENT_LEDGER_PATH,
        JSON.stringify(value) + "\n",
      );
      await expect(prepare(root)).rejects.toThrow();
    });
    it("rejects a changed commissioned source command before output construction", async () => {
      const root = await fixture(),
        value = JSON.parse(
          await readFile(resolve(root, SOURCE_TRANSITION_INPUT_PATH), "utf8"),
        );
      value.focusedCommands[0].argv = ["pnpm", "typecheck"];
      await committedChange(
        root,
        SOURCE_TRANSITION_INPUT_PATH,
        JSON.stringify(value) + "\n",
      );
      await expect(prepare(root)).rejects.toThrow();
    });
    it("rejects mixed source selection before interpreting any publication claim", async () => {
      const root = await fixture(),
        value = JSON.parse(
          await readFile(resolve(root, "package.json"), "utf8"),
        );
      value.milestoneLoop.verification.contractId = SOURCE_CONTRACT_ID;
      await committedChange(root, "package.json", JSON.stringify(value) + "\n");
      await expect(prepare(root)).rejects.toThrow("Mixed source/legacy");
    });
    it("refuses an existing epoch record even with a self-authored PASS", async () => {
      const root = await fixture();
      await committedChange(
        root,
        SOURCE_AUTHORITY_PUBLICATION_PATH,
        '{"status":"PASS"}\n',
      );
      await expect(prepare(root)).rejects.toThrow("Mixed source/legacy");
    });
    it("reaches the pending-publication fence before a dirty-tree substitute", async () => {
      const root = await fixture();
      await writeFile(
        resolve(root, AUTHORITY_MIGRATION_PENDING_PATH),
        "incomplete intent\n",
      );
      await expect(prepare(root)).rejects.toThrow("publication is pending");
    });
    it("runs the actual receipt-owning inspector without publishing its proposed files", async () => {
      const root = await fixture(),
        output = resolve(
          controller,
          "artifacts",
          "source-transition-cli-test-" + randomUUID(),
        );
      temporary.push(output);
      const result = await runPnpm(
        [
          "--config.verify-deps-before-run=error",
          "exec",
          "tsx",
          "tools/milestone-orchestrator/src/source-authority-transition-cli.ts",
          root,
          SNAPSHOT,
          output,
        ],
        { cwd: controller, timeoutMs: 110_000 },
      );
      expect(result.status, result.stderr).toBe(0);
      const checked = await validateCommandReceiptDirectory({
        directory: output,
        expectedStageId: "source-authority-transition",
        expectedCommandId: "source-transition-inspection",
        requiredKinds: [
          "source-authority-transition-inspection",
          "source-authority-proposed-file",
        ],
      });
      expect(checked.artifactCount).toBe(13);
      const report = JSON.parse(
        await readFile(resolve(output, "transition-inspection.json"), "utf8"),
      );
      expect(report.publicationAuthorized).toBe(false);
      expect(report.completionEligible).toBe(false);
      expect(
        git(root, "status", "--porcelain=v1", "--untracked-files=all"),
      ).toBe("");
      expect(existsSync(resolve(root, SOURCE_AUTHORITY_PUBLICATION_PATH))).toBe(
        false,
      );
    });
  },
);

// This cached value constructs test data only. Every exercised request reader
// independently reconstructs its own view from real committed Git objects.
let fixtureProjection: Awaited<ReturnType<typeof prepare>> | undefined;
const fakeAuditBytes = Buffer.from(
  '{"status":"PASS","fixture":"unauthenticated audit claim"}\n',
);
async function requestFixture() {
  const root = await fixture();
  fixtureProjection ??= await prepare(root);
  const request = structuredClone(
    createSourceAuthorityRequestBinding(fixtureProjection, {
      path: SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
      bytes: fakeAuditBytes.length,
      sha256: hash(fakeAuditBytes),
    }),
  );
  return { root, request };
}
type FixtureRequest = Awaited<ReturnType<typeof requestFixture>>["request"];
async function writeRequest(
  root: string,
  request: FixtureRequest,
  commit = true,
) {
  await mkdir(dirname(resolve(root, SOURCE_IMPLEMENTATION_EVIDENCE_PATH)), {
    recursive: true,
  });
  await writeFile(
    resolve(root, SOURCE_IMPLEMENTATION_EVIDENCE_PATH),
    fakeAuditBytes,
  );
  await writeFile(
    resolve(root, SOURCE_AUTHORITY_REQUEST_PATH),
    JSON.stringify(request, null, 2) + "\n",
  );
  if (commit) {
    git(root, "add", "--", ".agent/authority-requests/ORCH-AUTH-01");
    git(
      root,
      "commit",
      "--quiet",
      "-m",
      "Separate source authority request fixture",
    );
  }
  return git(root, "rev-parse", "HEAD");
}

describe(
  "separately committed source request bindings",
  { timeout: 120_000 },
  () => {
    it("reconstructs real committed output hashes without promoting a self-authored audit PASS", async () => {
      const { root, request } = await requestFixture(),
        requestCommit = await writeRequest(root, request);
      const result = await inspectSourceAuthorityRequestForReview({
        repositoryRoot: root,
      });
      expect(result).toMatchObject({
        schemaVersion: "source-authority-request-binding-inspection.v1",
        requestCommit,
        observedHead: requestCommit,
        implementationAuditAuthenticated: false,
        independentReviewAuthenticated: false,
        publicationAuthorized: false,
        completionEligible: false,
        canonicalStateReobserved: false,
      });
      expect(result.subject.implementation.commit).toBe(BASE);
      expect(result.outputs).toEqual(request.outputs);
      expect(result.subjectSha256).toBe(request.subjectSha256);
      expect(
        git(root, "status", "--porcelain=v1", "--untracked-files=all"),
      ).toBe("");
      expect(git(root, "rev-parse", "HEAD")).toBe(requestCommit);
      expect(
        git(
          root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
      expect(
        existsSync(resolve(root, "artifacts/orchestrator/state/state.json")),
      ).toBe(false);
    });
    it("rejects an uncommitted request at the committed-file boundary", async () => {
      const { root, request } = await requestFixture();
      await writeRequest(root, request, false);
      await expect(
        inspectCommittedSourceAuthorityRequestBinding({ repositoryRoot: root }),
      ).rejects.toThrow("committed regular file");
    });
    it("rejects a source request with an extra approval field", async () => {
      const { root, request } = await requestFixture();
      Object.assign(request, { approved: true });
      await writeRequest(root, request);
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("Unknown or missing");
    });
    it("rejects foreign scope even with a recomputed subject digest", async () => {
      const { root, request } = await requestFixture();
      Object.assign(request.subject, { contractId: "adopter-contract" });
      Object.assign(request, {
        subjectSha256: hash(Buffer.from(canonicalJson(request.subject) + "\n")),
      });
      await writeRequest(root, request);
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow();
    });
    it("rejects an arbitrary implementation-evidence path", async () => {
      const { root, request } = await requestFixture();
      Object.assign(request.implementationEvidence, { path: "arbitrary.json" });
      await writeRequest(root, request);
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("one fixed path");
    });
    it.each(["hash", "path"])(
      "rejects a substituted output %s by actual implementation reconstruction",
      async (kind) => {
        const { root, request } = await requestFixture();
        if (kind === "hash")
          Object.assign(request.outputs[0]!.next, { sha256: "0".repeat(64) });
        else
          Object.assign(request.outputs[0]!, {
            path: "unapproved-output.json",
          });
        await writeRequest(root, request);
        await expect(
          inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
        ).rejects.toThrow(
          "independently reconstructed implementation projection",
        );
      },
    );
    it("rejects a request commit that also changes implementation files", async () => {
      const { root, request } = await requestFixture();
      await writeRequest(root, request, false);
      await writeFile(resolve(root, "README.md"), "implementation changed\n");
      git(
        root,
        "add",
        "--",
        ".agent/authority-requests/ORCH-AUTH-01",
        "README.md",
      );
      git(root, "commit", "--quiet", "-m", "Mixed request and code fixture");
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("only its fixed request/evidence prefix");
    });
    it("rejects a request separated from its stated implementation by another commit", async () => {
      const { root, request } = await requestFixture();
      git(
        root,
        "commit",
        "--allow-empty",
        "--quiet",
        "-m",
        "Intervening fixture commit",
      );
      await writeRequest(root, request);
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("directly follow its implementation");
    });
    it("rejects a later rewrite of the committed request", async () => {
      const { root, request } = await requestFixture();
      await writeRequest(root, request);
      Object.assign(request.outputs[0]!.next, { sha256: "0".repeat(64) });
      await committedChange(
        root,
        SOURCE_AUTHORITY_REQUEST_PATH,
        JSON.stringify(request) + "\n",
      );
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("rewritten after introduction");
    });
    it("rejects implementation changes after the separate request", async () => {
      const { root, request } = await requestFixture();
      await writeRequest(root, request);
      await committedChange(root, "README.md", "later source change\n");
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("Source implementation or authority changed");
    });
    it("rejects a later replacement of referenced implementation evidence", async () => {
      const { root, request } = await requestFixture();
      await writeRequest(root, request);
      await committedChange(
        root,
        SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
        '{"different":"evidence"}\n',
      );
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("implementation evidence was rewritten");
    });
    it("keeps the ordinary request reader fenced during pending publication", async () => {
      const { root, request } = await requestFixture();
      await writeRequest(root, request);
      await writeFile(
        resolve(root, AUTHORITY_MIGRATION_PENDING_PATH),
        "pending fixture\n",
      );
      await expect(
        inspectSourceAuthorityRequestForReview({ repositoryRoot: root }),
      ).rejects.toThrow("publication is pending");
    });
    it("executes the actual committed-request CLI with a non-authorizing receipt", async () => {
      const { root, request } = await requestFixture();
      await writeRequest(root, request);
      const output = resolve(
        controller,
        "artifacts",
        "source-request-cli-test-" + randomUUID(),
      );
      temporary.push(output);
      const result = await runPnpm(
        [
          "--config.verify-deps-before-run=error",
          "exec",
          "tsx",
          "tools/milestone-orchestrator/src/source-authority-transition-cli.ts",
          "--request",
          root,
          output,
        ],
        { cwd: controller, timeoutMs: 110_000 },
      );
      expect(result.status, result.stderr).toBe(0);
      const checked = await validateCommandReceiptDirectory({
        directory: output,
        expectedStageId: "source-authority-transition",
        expectedCommandId: "source-request-binding-inspection",
        requiredKinds: [
          "source-authority-request-binding-inspection",
          "source-authority-proposed-file",
        ],
      });
      expect(checked.artifactCount).toBe(13);
      const report = JSON.parse(
        await readFile(resolve(output, "transition-inspection.json"), "utf8"),
      );
      expect(report.implementationAuditAuthenticated).toBe(false);
      expect(report.independentReviewAuthenticated).toBe(false);
      expect(report.publicationAuthorized).toBe(false);
      expect(
        git(root, "status", "--porcelain=v1", "--untracked-files=all"),
      ).toBe("");
      expect(existsSync(resolve(root, SOURCE_AUTHORITY_PUBLICATION_PATH))).toBe(
        false,
      );
    });
  },
);
