import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
import { basename, dirname, resolve } from "node:path";
import { Codex, type ThreadEvent } from "@openai/codex-sdk";
import { expect, vi } from "vitest";
import { SOURCE_AUTHORITY_REQUEST_PATH } from "../src/authority-publication.mjs";
import {
  createSourceAuthorityRequestBinding,
  prepareSourceAuthorityTransition,
  SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
} from "../src/source-authority-transition.js";
import {
  SOURCE_AUDIT_PREFIX,
  SOURCE_REVIEW_CHECK_IDS,
  sourceGit,
  sourceGitText,
  sourceHash,
  sourceIdentity,
} from "../src/source-authority-evidence.mjs";
import { SOURCE_GENERATION_PATHS } from "../src/source-authority-generation.mjs";
import { reviewSourceAuthorityRequest } from "../src/source-authority-review.js";
import { syntheticSourceAudit } from "./synthetic-source-audit.js";

export const controller = resolve(import.meta.dirname, "../../..");
const base = "fc2419d8bdfc3658fe76edf2b543b38051b359f1";
const snapshot = "91cbd3eb75ec771cfa1f315fe2641488e361c9e0";
export const owned: { root: string; parent: string; prefix: string }[] = [];
const originalEvidenceDirectory =
  process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"];
export async function cleanupSyntheticPublicationFixtures() {
  vi.restoreAllMocks();
  if (originalEvidenceDirectory === undefined)
    delete process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"];
  else
    process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = originalEvidenceDirectory;
  for (const { root, parent, prefix } of owned.splice(0)) {
    assert.equal(dirname(root), parent);
    assert(basename(root).startsWith(prefix));
    if (existsSync(root)) assert.equal(await realpath(root), root);
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 25,
    });
  }
}
export const bytes = (value: unknown) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n");
export async function put(root: string, path: string, contents: Uint8Array) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), contents);
}
async function testReceipt(
  root: string,
  prefix: string,
  stageId: string,
  commandId: string,
  files: { path: string; kind: string; contents: Buffer }[],
) {
  for (const file of files) await put(root, prefix + file.path, file.contents);
  const contents = bytes({
    schemaVersion: "1.0.0",
    stageId,
    commandId,
    status: "PASS",
    checks: [
      {
        id: "synthetic-unit-fixture",
        status: "PASS",
        summary:
          "Synthetic prerequisite fixture only; no implementation audit, SDK service, migration or candidate execution is claimed.",
      },
    ],
    artifacts: files.map((file) => ({
      path: file.path,
      kind: file.kind,
      bytes: file.contents.length,
      sha256: sourceHash(file.contents),
    })),
  });
  await put(root, prefix + "result.json", contents);
  return contents;
}
/** Real Git ancestry and current executing code, with explicitly synthetic
 * implementation-audit inputs. Only the SDK streaming boundary is mocked;
 * the review producer, gateway records, permit, lease and publisher are real. */
export async function requestFixture(
  omitNested?: "receipt" | "artifact",
  malformedExecution = false,
) {
  const parent = await realpath(tmpdir());
  const root = await realpath(
    await mkdtemp(resolve(parent, "source-publication-test-")),
  );
  owned.push({ root, parent, prefix: "source-publication-test-" });
  sourceGit(controller, [
    "clone",
    "--shared",
    "--no-checkout",
    "--single-branch",
    "--config",
    "maintenance.auto=false",
    "--config",
    "gc.auto=0",
    controller,
    root,
  ]);
  sourceGit(root, ["checkout", "--quiet", "-B", "master", base]);
  sourceGit(root, ["remote", "remove", "origin"]);
  sourceGit(root, [
    "config",
    "user.name",
    "Synthetic source publication fixture",
  ]);
  sourceGit(root, [
    "config",
    "user.email",
    "source-publication@example.invalid",
  ]);
  const policyPath = "tools/source-release-policy.json";
  const policyBytes = await readFile(resolve(controller, policyPath));
  const policy = JSON.parse(policyBytes.toString()) as {
    payloadFiles: string[];
  };
  for (const path of [
    policyPath,
    ...policy.payloadFiles.filter(
      (path) => !SOURCE_GENERATION_PATHS.includes(path),
    ),
  ])
    await put(root, path, await readFile(resolve(controller, path)));
  // Keep the real legacy contract in this request fixture, with the current
  // implementation's additive command definitions (including migration).
  const fixturePackage = JSON.parse(
    (await readFile(resolve(root, "package.json"))).toString(),
  );
  const currentPackage = JSON.parse(
    (await readFile(resolve(controller, "package.json"))).toString(),
  );
  fixturePackage.scripts = currentPackage.scripts;
  await put(root, "package.json", bytes(fixturePackage));
  sourceGit(root, ["add", "."]);
  sourceGit(root, [
    "commit",
    "--quiet",
    "-m",
    "Current source implementation for synthetic publication fixture",
  ]);
  const projection = await prepareSourceAuthorityTransition({
    repositoryRoot: root,
    snapshotCommit: snapshot,
  });
  const { commands, nested } = await syntheticSourceAudit({
    root,
    implementation: projection.subject.implementation,
    writeReceipt: testReceipt,
  });
  if (malformedExecution) {
    const record = nested.find(
      (file) => file.path === "commands/typecheck/audit-child-execution.json",
    )!;
    const value = JSON.parse(record.contents.toString());
    value.argv = ["pnpm", "test:unit"];
    record.contents = bytes(value);
  }
  const { files: outputs, ...inspection } = projection;
  expect(outputs.map((file) => file.path)).toEqual(SOURCE_GENERATION_PATHS);
  const audit = await testReceipt(
    root,
    SOURCE_AUDIT_PREFIX,
    "source-authority-implementation",
    "source-authority-audit",
    [
      {
        path: "audit.json",
        kind: "source-authority-implementation-audit",
        contents: bytes({
          schemaVersion: "source-authority-implementation-audit.v1",
          status: "PASS",
          completionEligible: false,
          implementation: projection.subject.implementation,
          runtime: {
            nodeVersion: "v24.18.0",
            pnpmVersion: "11.15.1",
            platform: process.platform,
            architecture: process.arch,
          },
          subjectSha256: projection.subjectSha256,
          commands,
        }),
      },
      {
        path: "transition-inspection.json",
        kind: "source-authority-transition-inspection",
        contents: bytes(inspection),
      },
      ...outputs.map((file) => ({
        path: "proposed-root/" + file.path,
        kind: "source-authority-audit-raw-evidence",
        contents: file.contents,
      })),
      ...nested.filter(
        (file) =>
          file.path !==
          (omitNested === "receipt"
            ? "commands/typecheck/result.json"
            : omitNested === "artifact"
              ? "commands/typecheck/fixture-0.json"
              : null),
      ),
    ],
  );
  const request = createSourceAuthorityRequestBinding(projection, {
    path: SOURCE_IMPLEMENTATION_EVIDENCE_PATH,
    bytes: audit.length,
    sha256: sourceHash(audit),
  });
  await put(root, SOURCE_AUTHORITY_REQUEST_PATH, bytes(request));
  sourceGit(root, ["add", "--", ".agent/authority-requests/ORCH-AUTH-01"]);
  sourceGit(root, [
    "commit",
    "--quiet",
    "-m",
    "Separately committed synthetic source request",
  ]);
  return {
    root,
    request,
    identity: sourceIdentity(root, true),
    requestIdentity: {
      commit: sourceGitText(root, "rev-parse", "HEAD"),
      sha256: sourceHash(bytes(request)),
    },
  };
}
export async function review(
  fixture: Awaited<ReturnType<typeof requestFixture>>,
  decision = "approve",
) {
  const parent = await realpath(resolve(controller, "artifacts"));
  const output = resolve(
    parent,
    "source-publication-review-test-" + randomUUID(),
  );
  owned.push({
    root: output,
    parent,
    prefix: "source-publication-review-test-",
  });
  let view: string | undefined;
  const startThread = Codex.prototype.startThread;
  const spy = vi
    .spyOn(Codex.prototype, "startThread")
    .mockImplementation(function (this: Codex, options) {
      expect(options?.sandboxMode).toBe("read-only");
      view = options!.workingDirectory!;
      expect(sourceIdentity(view, true)).toEqual(fixture.identity);
      expect(
        existsSync(resolve(view, "artifacts/orchestrator/state/state.json")),
      ).toBe(false);
      expect(
        sourceGitText(
          view,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
      const thread = startThread.call(this, options);
      vi.spyOn(thread, "runStreamed").mockImplementation(async () => ({
        events: (async function* (): AsyncGenerator<ThreadEvent> {
          yield {
            type: "thread.started",
            thread_id: "synthetic-sdk-stream-" + randomUUID(),
          };
          yield {
            type: "item.completed",
            item: {
              id: "synthetic-review",
              type: "agent_message",
              text: JSON.stringify({
                requestCommit: fixture.requestIdentity.commit,
                requestSha256: fixture.requestIdentity.sha256,
                subjectSha256: fixture.request.subjectSha256,
                implementationCommit:
                  fixture.request.subject.implementation.commit,
                decision,
                checks: SOURCE_REVIEW_CHECK_IDS.map((id) => ({
                  id,
                  passed: decision === "approve",
                  evidence: "Synthetic SDK boundary fixture: " + id,
                })),
                findings: [],
              }),
            },
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              cache_write_input_tokens: 0,
              output_tokens: 1,
              reasoning_output_tokens: 0,
            },
          };
        })(),
      }));
      return thread;
    });
  try {
    const result = await reviewSourceAuthorityRequest({
      repositoryRoot: fixture.root,
      artifactDirectory: output,
    });
    expect(spy).toHaveBeenCalledOnce();
    return result;
  } finally {
    spy.mockRestore();
    if (view) expect(existsSync(view)).toBe(false);
  }
}
