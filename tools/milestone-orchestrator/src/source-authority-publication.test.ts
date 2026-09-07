import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, realpath, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { Codex } from "@openai/codex-sdk";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  assertActiveAuthorityPublication,
  AUTHORITY_MIGRATION_PENDING_PATH,
} from "./authority-publication.mjs";
import {
  SOURCE_AUDIT_COMMANDS,
  sourceGit,
  sourceGitText,
  sourceHash,
  sourceIdentity,
  sourceRead,
  sourceFilePin,
  sourceHistoricalFiles,
  inspectSourceImplementationEvidence,
} from "./source-authority-evidence.mjs";
import {
  inspectSourceAuditExecution,
  inspectSourceAuditReports,
} from "./source-authority-audit-reports.mjs";
import {
  SOURCE_GENERATION_PATHS,
  SOURCE_PUBLICATION_EVIDENCE_PREFIX,
} from "./source-authority-generation.mjs";
import { inspectCommittedSourcePublication } from "./source-authority-records.mjs";
import { inspectActiveSourceContractIntegrity } from "./source-authority-anchor.js";
import {
  loadActiveVerificationManifest,
  loadVerificationScopePolicy,
} from "./config.js";
import { sourceScheduleGeneration } from "./source-schedule.js";
import { StateStore } from "./state-store.js";
import { validateCommandReceiptDirectory } from "./verifier.js";
import {
  assertSourceReviewPermit,
  reviewSourceAuthorityRequest,
} from "./source-authority-review.js";
import {
  publishSourceAuthority,
  sourceTransactionPaths,
  SOURCE_STATE_PATH,
  type SourcePublicationHooks,
} from "./source-authority-publication.js";
import { ControllerLease } from "./controller-lease.js";

import {
  controller,
  owned,
  bytes,
  put,
  requestFixture,
  review,
  cleanupSyntheticPublicationFixtures,
} from "../test/synthetic-source-publication.js";
afterEach(cleanupSyntheticPublicationFixtures);

describe(
  "leased source publication with a synthetic SDK boundary",
  { timeout: 180_000 },
  () => {
    it("publishes all exact outputs through the real review producer, permit and mutation lease without committing or adopting state", async () => {
      const fixture = await requestFixture();
      const reviewed = await review(fixture);
      const trace = (phase: string, path: string | null = null) => {
        console.info(
          "Synthetic publication boundary",
          JSON.stringify({ phase, path, observedAt: new Date().toISOString() }),
        );
      };
      trace("review-completed");
      const result = await publishSourceAuthority({
        repositoryRoot: fixture.root,
        request: fixture.requestIdentity,
        reviewPermit: reviewed.permit,
        hooks: {
          afterStaged: () => trace("after-staged"),
          afterIntent: () => trace("after-intent"),
          beforeReplace: (path) => trace("before-replace", path),
          afterReplace: (path) => trace("after-replace", path),
          beforeFinalization: () => trace("before-finalization"),
          afterFinalization: () => trace("after-finalization"),
        },
      });
      expect(result.result).toMatchObject({
        status: "PASS",
        completionEligible: false,
        commitRequired: true,
        resumed: false,
      });
      const receipt = await validateCommandReceiptDirectory({
        directory: resolve(fixture.root, SOURCE_PUBLICATION_EVIDENCE_PREFIX),
        expectedStageId: "source-authority-publication",
        expectedCommandId: "loop:authority:migrate",
        requiredKinds: [
          "source-authority-publication",
          "source-authority-publication-intent",
          "source-authority-publication-events",
          "source-authority-publication-runtime",
        ],
      });
      expect(receipt.receiptSha256).toBe(result.receipt.sha256);
      expect(sourceIdentity(fixture.root)).toEqual(fixture.identity);
      for (const file of result.files)
        expect(await readFile(resolve(fixture.root, file.path))).toEqual(
          file.contents,
        );
      expect(
        existsSync(resolve(fixture.root, AUTHORITY_MIGRATION_PENDING_PATH)),
      ).toBe(false);
      expect(
        sourceGitText(
          fixture.root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
      expect(
        existsSync(
          resolve(fixture.root, "artifacts/orchestrator/state/state.json"),
        ),
      ).toBe(false);
      await expect(
        assertSourceReviewPermit(
          reviewed.permit,
          fixture.root,
          fixture.requestIdentity,
        ),
      ).rejects.toThrow("live permit");
      await expect(
        assertActiveAuthorityPublication(fixture.root),
      ).rejects.toThrow();
    });
    it("refuses a rejected SDK review before acquiring ownership or publishing an intent", async () => {
      const fixture = await requestFixture();
      await expect(review(fixture, "reject")).rejects.toThrow(
        "did not approve",
      );
      expect(sourceIdentity(fixture.root, true)).toEqual(fixture.identity);
      expect(
        sourceGitText(
          fixture.root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
      expect(
        existsSync(resolve(fixture.root, AUTHORITY_MIGRATION_PENDING_PATH)),
      ).toBe(false);
    });
    it.each(["receipt", "artifact"] as const)(
      "refuses an audit packet omitting its nested %s before the SDK boundary",
      async (omission) => {
        const fixture = await requestFixture(omission);
        await expect(review(fixture)).rejects.toThrow(
          "does not bind nested command evidence",
        );
        expect(sourceIdentity(fixture.root, true)).toEqual(fixture.identity);
        expect(
          sourceGitText(
            fixture.root,
            "for-each-ref",
            "--format=%(refname)",
            "refs/milestone-loop/",
          ),
        ).toBe("");
      },
    );
    it("rejects altered raw execution inside a completely rehashed committed audit before the SDK boundary", async () => {
      const fixture = await requestFixture(undefined, true);
      const start = vi
        .spyOn(Codex.prototype, "startThread")
        .mockImplementation(() => {
          throw new Error("Synthetic SDK boundary unexpectedly reached");
        });
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
      await expect(
        reviewSourceAuthorityRequest({
          repositoryRoot: fixture.root,
          artifactDirectory: output,
        }),
      ).rejects.toThrow();
      expect(start).not.toHaveBeenCalled();
      expect(sourceIdentity(fixture.root, true)).toEqual(fixture.identity);
      expect(
        await sourceRead(fixture.root, AUTHORITY_MIGRATION_PENDING_PATH, true),
      ).toBeNull();
      expect(
        sourceGitText(
          fixture.root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
    });
    it("reaches the held mutation owner and refuses a competing source acquisition before intent", async () => {
      const fixture = await requestFixture();
      const reviewed = await review(fixture);
      let observedOwner: string | null = null;
      await expect(
        publishSourceAuthority({
          repositoryRoot: fixture.root,
          request: fixture.requestIdentity,
          reviewPermit: reviewed.permit,
          hooks: {
            afterStaged: async () => {
              const held = sourceGitText(
                fixture.root,
                "rev-parse",
                ControllerLease.leaseReference(),
              );
              await expect(
                ControllerLease.acquire({
                  repositoryRoot: fixture.root,
                  statePath: SOURCE_STATE_PATH,
                  operation: "authority-migrate",
                  sourceAuthorityRequest: fixture.requestIdentity,
                  sourceReviewPermit: reviewed.permit,
                  hooks: {
                    afterObservedExisting: ({ objectId }) => {
                      observedOwner = objectId;
                    },
                  },
                }),
              ).rejects.toThrow("holds the mutation lease");
              expect(observedOwner).toBe(held);
              expect(
                sourceGitText(
                  fixture.root,
                  "rev-parse",
                  ControllerLease.leaseReference(),
                ),
              ).toBe(held);
              throw new Error(
                "Synthetic stop after real competing owner rejection",
              );
            },
          },
        }),
      ).rejects.toThrow("Synthetic stop after real competing owner rejection");
      expect(observedOwner).toMatch(/^[a-f0-9]{40}$/);
      expect(sourceIdentity(fixture.root, true)).toEqual(fixture.identity);
      expect(
        await sourceRead(fixture.root, AUTHORITY_MIGRATION_PENDING_PATH, true),
      ).toBeNull();
      expect(
        sourceGitText(
          fixture.root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
    });
    it("preserves foreign output bytes introduced after durable intent and refuses replacement", async () => {
      const fixture = await requestFixture();
      const reviewed = await review(fixture);
      const target = SOURCE_GENERATION_PATHS[0]!;
      const foreign = Buffer.from(
        "Foreign output introduced at the actual intent boundary\n",
      );
      let reached = false;
      await expect(
        publishSourceAuthority({
          repositoryRoot: fixture.root,
          request: fixture.requestIdentity,
          reviewPermit: reviewed.permit,
          hooks: {
            afterIntent: async () => {
              reached = true;
              expect(
                await sourceRead(
                  fixture.root,
                  AUTHORITY_MIGRATION_PENDING_PATH,
                ),
              ).not.toBeNull();
              await put(fixture.root, target, foreign);
            },
          },
        }),
      ).rejects.toThrow("Foreign active file was preserved");
      expect(reached).toBe(true);
      expect(await readFile(resolve(fixture.root, target))).toEqual(foreign);
      for (const output of fixture.request.outputs.filter(
        (output) => output.path !== target,
      ))
        expect(
          sourceFilePin(
            output.path,
            await sourceRead(fixture.root, output.path, true),
          ),
        ).toEqual(output.prior);
      expect(
        await sourceRead(fixture.root, AUTHORITY_MIGRATION_PENDING_PATH),
      ).not.toBeNull();
      expect(
        await sourceRead(
          fixture.root,
          sourceTransactionPaths(fixture.requestIdentity.sha256)
            .completedIntent,
          true,
        ),
      ).toBeNull();
      expect(
        sourceGitText(
          fixture.root,
          "for-each-ref",
          "--format=%(refname)",
          "refs/milestone-loop/",
        ),
      ).toBe("");
    });
    describe.each([
      "afterIntent",
      "afterReplace",
      "afterCompletionRecord",
      "afterFinalization",
    ] as const)("actual recovery from %s", (phase) => {
      let fixture: Awaited<ReturnType<typeof requestFixture>>;
      let originalReview: Awaited<ReturnType<typeof review>>;
      let originalIntent: Buffer;
      // Establish an actual interrupted publisher under the same finite bound.
      // The test's next invocation is a distinct fresh-review recovery attempt.
      beforeEach(async () => {
        fixture = await requestFixture();
        originalReview = await review(fixture);
        let reached = false;
        const hooks: SourcePublicationHooks = {
          [phase]: () => {
            reached = true;
            throw new Error("Synthetic publication interruption at " + phase);
          },
        };
        await expect(
          publishSourceAuthority({
            repositoryRoot: fixture.root,
            request: fixture.requestIdentity,
            reviewPermit: originalReview.permit,
            hooks,
          }),
        ).rejects.toThrow("Synthetic publication interruption at " + phase);
        expect(reached).toBe(true);
        const paths = sourceTransactionPaths(fixture.requestIdentity.sha256);
        const pending = await sourceRead(
          fixture.root,
          AUTHORITY_MIGRATION_PENDING_PATH,
          true,
        );
        const completed = await sourceRead(
          fixture.root,
          paths.completedIntent,
          true,
        );
        expect(pending === null).toBe(phase === "afterFinalization");
        expect(completed !== null).toBe(
          phase === "afterCompletionRecord" || phase === "afterFinalization",
        );
        originalIntent = (pending ?? completed)!;
        expect(originalIntent).not.toBeNull();
        await expect(
          assertActiveAuthorityPublication(fixture.root),
        ).rejects.toThrow();
        await expect(
          assertSourceReviewPermit(
            originalReview.permit,
            fixture.root,
            fixture.requestIdentity,
          ),
        ).rejects.toThrow("live permit");
        expect(
          sourceGitText(
            fixture.root,
            "for-each-ref",
            "--format=%(refname)",
            "refs/milestone-loop/",
          ),
        ).toBe("");
      }, 180_000);
      it("requires a fresh review and completes the exact recorded request without changing the original intent", async () => {
        const reviewed = await review(fixture);
        const result = await publishSourceAuthority({
          repositoryRoot: fixture.root,
          request: fixture.requestIdentity,
          reviewPermit: reviewed.permit,
        });
        expect(result.result).toMatchObject({
          status: "PASS",
          resumed: true,
          completionEligible: false,
          commitRequired: true,
        });
        expect(result.intentBytes).toEqual(originalIntent);
        expect(result.result.reviewReceiptSha256).toBe(
          originalReview.receipt.receiptSha256,
        );
        expect(result.result.freshReviewReceiptSha256).not.toBe(
          result.result.reviewReceiptSha256,
        );
        for (const output of result.files)
          expect(await readFile(resolve(fixture.root, output.path))).toEqual(
            output.contents,
          );
        expect(
          await sourceRead(
            fixture.root,
            AUTHORITY_MIGRATION_PENDING_PATH,
            true,
          ),
        ).toBeNull();
        expect(sourceIdentity(fixture.root)).toEqual(fixture.identity);
        expect(
          await sourceRead(fixture.root, SOURCE_STATE_PATH, true),
        ).toBeNull();
        expect(
          sourceGitText(
            fixture.root,
            "for-each-ref",
            "--format=%(refname)",
            "refs/milestone-loop/",
          ),
        ).toBe("");
        await expect(
          assertActiveAuthorityPublication(fixture.root),
        ).rejects.toThrow();
      });
    });
    describe("committed synthetic publication consumers", () => {
      let fixture: Awaited<ReturnType<typeof requestFixture>>;
      beforeEach(async () => {
        fixture = await requestFixture();
        const reviewed = await review(fixture);
        await publishSourceAuthority({
          repositoryRoot: fixture.root,
          request: fixture.requestIdentity,
          reviewPermit: reviewed.permit,
        });
        await expect(
          assertActiveAuthorityPublication(fixture.root),
        ).rejects.toThrow("not activated");
        sourceGit(fixture.root, [
          "add",
          ...SOURCE_GENERATION_PATHS,
          SOURCE_PUBLICATION_EVIDENCE_PREFIX,
        ]);
        sourceGit(fixture.root, [
          "commit",
          "--quiet",
          "-m",
          "Synthetic reviewed publication, not real service evidence",
        ]);
        sourceIdentity(fixture.root, true);
      }, 180_000);
      it("agrees across native authority, commissioning, schedule and integrity readers while fencing state", async () => {
        await expect(
          assertActiveAuthorityPublication(fixture.root),
        ).resolves.toBe("source");
        const inspected = await inspectCommittedSourcePublication(fixture.root);
        expect(inspected.activationCommit).toBe(
          sourceIdentity(fixture.root).commit,
        );
        const manifest = await loadActiveVerificationManifest(fixture.root);
        const policy = await loadVerificationScopePolicy(fixture.root);
        expect(sourceScheduleGeneration(manifest.value, policy.value)).toBe(
          "source",
        );
        expect(
          (
            await inspectActiveSourceContractIntegrity(fixture.root)
          ).checks.every((check) => check.status === "PASS"),
        ).toBe(true);
        const native = spawnSync(
          process.execPath,
          ["scripts/verify.mjs", "--list"],
          {
            cwd: fixture.root,
            encoding: "utf8",
            windowsHide: true,
            timeout: 60_000,
            maxBuffer: 1024 * 1024,
          },
        );
        expect(native.error).toBeUndefined();
        expect(native.status, native.stderr).toBe(0);
        expect(native.stdout).toContain(
          "Approved orchestrator source qualification",
        );
        expect(native.stdout).toContain("source-acceptance");
        expect(native.stdout).not.toContain("domain-construction");
        const store = new StateStore(fixture.root, SOURCE_STATE_PATH);
        await expect(store.load()).rejects.toThrow(
          "Legacy controller state is fenced",
        );
        await expect(store.loadForMutation()).rejects.toThrow(
          "Legacy controller state is fenced",
        );
        expect(
          await sourceRead(fixture.root, SOURCE_STATE_PATH, true),
        ).toBeNull();
        expect(
          sourceGitText(
            fixture.root,
            "for-each-ref",
            "--format=%(refname)",
            "refs/milestone-loop/",
          ),
        ).toBe("");
      });
      it("permits an ordinary code fix and rejects changed schedules, altered receipts and committed rollback", async () => {
        await put(
          fixture.root,
          "scripts/verify.mjs",
          Buffer.concat([
            await readFile(resolve(fixture.root, "scripts/verify.mjs")),
            Buffer.from("\n// Synthetic ordinary source implementation fix.\n"),
          ]),
        );
        sourceGit(fixture.root, ["add", "scripts/verify.mjs"]);
        sourceGit(fixture.root, [
          "commit",
          "--quiet",
          "-m",
          "Synthetic ordinary implementation fix",
        ]);
        await expect(
          assertActiveAuthorityPublication(fixture.root),
        ).resolves.toBe("source");
        for (const path of [
          ".agent/verification-manifest.json",
          SOURCE_PUBLICATION_EVIDENCE_PREFIX + "publication.json",
        ]) {
          const original = (await sourceRead(fixture.root, path))!;
          await put(
            fixture.root,
            path,
            Buffer.concat([original, Buffer.from("\n")]),
          );
          await expect(
            assertActiveAuthorityPublication(fixture.root),
          ).rejects.toThrow("not activated");
          await put(fixture.root, path, original);
        }
        for (const output of SOURCE_GENERATION_PATHS) {
          const prior = fixture.request.subject.prior.find(
            (pin: { path: string }) => pin.path === output,
          )!;
          if (prior.exists)
            await put(
              fixture.root,
              output,
              sourceGit(fixture.root, [
                "show",
                fixture.request.subject.implementation.commit + ":" + output,
              ]),
            );
          else await rm(resolve(fixture.root, output));
        }
        sourceGit(fixture.root, ["add", ...SOURCE_GENERATION_PATHS]);
        sourceGit(fixture.root, [
          "commit",
          "--quiet",
          "-m",
          "Synthetic prohibited rollback",
        ]);
        await expect(
          assertActiveAuthorityPublication(fixture.root),
        ).rejects.toThrow("cannot be rolled back");
      });
    });
  },
);

// These decoder regressions start with one real committed fixture packet. Its
// command observations are explicitly synthetic; mutation cases exercise report
// semantics after the enclosing reader's receipt/hash boundary.
describe(
  "synthetic implementation-audit report meanings",
  { timeout: 180_000 },
  () => {
    type Artifact = {
      path: string;
      kind: string;
      bytes: number;
      sha256: string;
      contents: Buffer;
    };
    type Json = ReturnType<typeof JSON.parse>;
    let basis: Awaited<ReturnType<typeof inspectSourceImplementationEvidence>>;
    let implementationFiles: Map<string, Buffer>;
    beforeAll(async () => {
      const fixture = await requestFixture();
      basis = await inspectSourceImplementationEvidence(
        fixture.root,
        fixture.request,
        fixture.requestIdentity.commit,
      );
      const commit = fixture.request.subject.implementation.commit;
      const policyPath = "tools/source-release-policy.json";
      const policy = JSON.parse(
        sourceHistoricalFiles(fixture.root, commit, [policyPath])
          .get(policyPath)!
          .toString(),
      );
      implementationFiles = sourceHistoricalFiles(fixture.root, commit, [
        ...new Set<string>([
          policyPath,
          ...policy.payloadFiles,
          ...policy.sourceCheckFiles,
          "tools/milestone-orchestrator/config/test-ownership.json",
          "tools/milestone-orchestrator/config/invariant-suite.json",
          "pnpm-workspace.yaml",
          "pnpm-lock.yaml",
        ]),
      ]);
    }, 180_000);
    function subject(id: string) {
      const artifacts = new Map<string, Artifact>(
        [...basis.artifacts].map(([path, file]) => [
          path,
          { ...file, contents: Buffer.from(file.contents) },
        ]),
      );
      const expected = SOURCE_AUDIT_COMMANDS.find(
        (command) => command.id === id,
      )!;
      const command = JSON.parse(
        JSON.stringify(
          basis.report.commands.find(
            (command: { id: string }) => command.id === id,
          ),
        ),
      );
      const read = (prefix: string) => {
        const owned = artifacts.get(prefix + "result.json");
        assert(owned, "Synthetic nested receipt is absent: " + prefix);
        const receipt = JSON.parse(owned.contents.toString());
        return {
          receipt,
          bytes: owned.contents,
          sha256: sourceHash(owned.contents),
          artifacts: new Map<string, Artifact>(
            receipt.artifacts.map((artifact: Omit<Artifact, "contents">) => {
              const contents = artifacts.get(prefix + artifact.path)?.contents;
              assert(
                contents,
                "Synthetic nested artifact is absent: " +
                  prefix +
                  artifact.path,
              );
              return [artifact.path, { ...artifact, contents }];
            }),
          ),
        };
      };
      return {
        artifacts,
        expected,
        command,
        read,
        implementation: basis.report.implementation,
        runtime: basis.report.runtime,
        implementationFiles: new Map(
          [...implementationFiles].map(([path, contents]) => [
            path,
            Buffer.from(contents),
          ]),
        ),
      };
    }
    function edit(
      input: ReturnType<typeof subject>,
      path: string,
      mutate: (value: Json) => void,
    ) {
      const artifact = input.artifacts.get(
        "commands/" + input.expected.id + "/" + path,
      )!;
      const value = JSON.parse(artifact.contents.toString());
      mutate(value);
      artifact.contents = bytes(value);
      artifact.bytes = artifact.contents.length;
      artifact.sha256 = sourceHash(artifact.contents);
      if (path.startsWith("entries/")) {
        // Rebind the nested receipt and aggregate metadata so this case reaches
        // the changed report meaning rather than failing an earlier hash check.
        const id = path.split("/")[1]!;
        const prefix = "commands/invariants/entries/" + id + "/";
        const nested = input.artifacts.get(prefix + "result.json")!;
        const receipt = JSON.parse(nested.contents.toString());
        for (const file of receipt.artifacts) {
          const contents = input.artifacts.get(prefix + file.path)!.contents;
          file.bytes = contents.length;
          file.sha256 = sourceHash(contents);
        }
        nested.contents = bytes(receipt);
        nested.bytes = nested.contents.length;
        nested.sha256 = sourceHash(nested.contents);
        edit(input, "invariant-suite-report.json", (report) => {
          const bound = report.commands.find(
            (command: { id: string }) => command.id === id,
          ).receipt;
          bound.receiptBytes = nested.bytes;
          bound.receiptSha256 = nested.sha256;
          bound.artifactBytes = receipt.artifacts.reduce(
            (total: number, file: { bytes: number }) => total + file.bytes,
            0,
          );
          for (const file of bound.artifacts) {
            const actual = receipt.artifacts.find(
              (artifact: { path: string }) =>
                file.path.replaceAll("\\", "/").endsWith("/" + artifact.path),
            );
            file.bytes = actual.bytes;
            file.sha256 = actual.sha256;
          }
        });
      }
    }
    async function decode(input: ReturnType<typeof subject>) {
      const execution = inspectSourceAuditExecution(input);
      return inspectSourceAuditReports({
        ...input,
        execution,
        child: input.read("commands/" + input.expected.id + "/"),
        readNestedReceipt: async (prefix: string) =>
          input.read("commands/" + input.expected.id + "/" + prefix),
      });
    }
    it.each(SOURCE_AUDIT_COMMANDS.map((command) => command.id))(
      "decodes the actual-shaped synthetic %s report without granting completion",
      async (id) => {
        await expect(decode(subject(id))).resolves.toBeDefined();
        expect(basis.report.completionEligible).toBe(false);
      },
    );
    const malformedExecutions: [string, (value: Json) => void][] = [
      [
        "wrong implementation",
        (value) => {
          value.implementation.commit = "0".repeat(40);
        },
      ],
      [
        "substituted argv",
        (value) => {
          value.argv = ["pnpm", "test:unit"];
        },
      ],
      [
        "wrong timeout",
        (value) => {
          value.timeoutMs = 65 * 60 * 1000;
        },
      ],
      [
        "nonzero exit",
        (value) => {
          value.exitCode = 7;
        },
      ],
      [
        "termination signal",
        (value) => {
          value.signal = "SIGTERM";
        },
      ],
      [
        "execution error",
        (value) => {
          value.error = "Synthetic launch failure";
        },
      ],
      [
        "truncated output",
        (value) => {
          value.supervision.stdout.truncated = true;
        },
      ],
      [
        "unclosed streams",
        (value) => {
          value.supervision.streamsClosed = false;
        },
      ],
      [
        "wrong captured length",
        (value) => {
          value.supervision.stdout.bytesCaptured++;
        },
      ],
      [
        "reversed timestamps",
        (value) => {
          value.finishedAt = "2026-09-05T00:00:00.000Z";
        },
      ],
    ];
    it.each(malformedExecutions)(
      "rejects raw audit execution with %s",
      async (_label, mutate) => {
        const input = subject("typecheck");
        edit(input, "audit-child-execution.json", mutate);
        await expect(decode(input)).rejects.toThrow();
      },
    );
    it("rejects a missing observed audit stdout log", async () => {
      const input = subject("typecheck");
      input.artifacts.delete("commands/typecheck/audit-child-stdout.log");
      await expect(decode(input)).rejects.toThrow();
    });
    const malformedReports: [string, string, string, (value: Json) => void][] =
      [
        [
          "typecheck",
          "fixture-0.json",
          "foreign compiler identity",
          (value) => {
            value.identity.gitCommit = "0".repeat(40);
          },
        ],
        [
          "lint",
          "fixture-0.json",
          "truncated lint output",
          (value) => {
            value.commands[0].supervision.stdout.truncated = true;
          },
        ],
        [
          "format",
          "fixture-0.json",
          "substituted formatter",
          (value) => {
            value.commands[0].command = "synthetic success-only command";
          },
        ],
        [
          "architecture",
          "architecture.json",
          "omitted architecture file",
          (value) => {
            value.fileCount--;
          },
        ],
        [
          "dependencies",
          "installed-graph.stdout.log",
          "omitted workspace graph",
          (value) => {
            value.pop();
          },
        ],
        [
          "unit",
          "vitest-report.json",
          "omitted root test file",
          (value) => {
            value.testResults.pop();
            value.numTotalTests--;
            value.numPassedTests--;
            value.numTotalTestSuites--;
            value.numPassedTestSuites--;
          },
        ],
        [
          "unit",
          "vitest-report.json",
          "empty raw assertions",
          (value) => {
            value.testResults[0].assertionResults = [];
          },
        ],
        [
          "unit",
          "vitest-report.json",
          "skipped raw assertion",
          (value) => {
            value.testResults[0].assertionResults[0].status = "pending";
          },
        ],
        [
          "unit",
          "vitest-report.json",
          "failed raw assertion",
          (value) => {
            value.testResults[0].assertionResults[0].status = "failed";
          },
        ],
        [
          "unit",
          "vitest-report.json",
          "unbound raw report",
          (value) => {
            value.testResults[0].assertionResults[0].fullName += " altered";
          },
        ],
        [
          "unit",
          "test-run-summary.json",
          "changed summary identity",
          (value) => {
            value.candidate.gitCommit = "0".repeat(40);
          },
        ],
        [
          "invariants",
          "invariant-suite-report.json",
          "changed registry identity",
          (value) => {
            value.registry.sha256 = "0".repeat(64);
          },
        ],
        [
          "invariants",
          "invariant-suite-report.json",
          "substituted invariant command",
          (value) => {
            value.commands[0].argv = ["node", "synthetic-success-only.mjs"];
          },
        ],
        [
          "invariants",
          "entries/protected-integrity/report.json",
          "omitted original integrity meaning",
          (value) => {
            value.checks[0].id = "synthetic-replacement";
          },
        ],
        [
          "build",
          "source-release/consumer.json",
          "promoted consumer qualification",
          (value) => {
            value.completeBuildQualification = true;
          },
        ],
        [
          "build",
          "build-report.json",
          "omitted build output",
          (value) => {
            value.outputs.files.pop();
            value.outputs.fileCount--;
          },
        ],
      ];
    it.each(malformedReports)(
      "rejects synthetic %s evidence with %s (%s)",
      async (id, path, _label, mutate) => {
        const input = subject(id);
        edit(input, path, mutate);
        await expect(decode(input)).rejects.toThrow();
      },
    );
    it("rejects a missing nested invariant receipt despite a PASS aggregate", async () => {
      const input = subject("invariants");
      input.artifacts.delete(
        "commands/invariants/entries/fail-closed-evidence/result.json",
      );
      await expect(decode(input)).rejects.toThrow();
    });
    it("rejects an invalid release archive even with updated archive hash metadata", async () => {
      const input = subject("build");
      const artifact = input.artifacts.get(
        "commands/build/source-release/release.tar.gz",
      )!;
      artifact.contents = Buffer.from("Synthetic invalid archive bytes\n");
      edit(input, "source-release/release-manifest.json", (value) => {
        value.archive.bytes = artifact.contents.length;
        value.archive.sha256 = sourceHash(artifact.contents);
      });
      await expect(decode(input)).rejects.toThrow();
    });
    it("rejects release payload bytes that differ from the audited implementation", async () => {
      const input = subject("build");
      input.implementationFiles.set(
        "tools/milestone-orchestrator/src/source-authority-control.ts",
        Buffer.from("Synthetic substituted source\n"),
      );
      await expect(decode(input)).rejects.toThrow("Release payload differs");
    });
  },
);
