import { superviseCommand } from "./process-supervisor.js";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupSyntheticPublicationFixtures,
  requestFixture,
  review,
  put,
} from "../test/synthetic-source-publication.js";
import { trustedTestExecutionProvider } from "../test/fixtures.js";
import {
  publishSourceAuthority,
  SOURCE_STATE_PATH,
} from "./source-authority-publication.js";
import {
  SOURCE_GENERATION_PATHS,
  SOURCE_PUBLICATION_EVIDENCE_PREFIX,
} from "./source-authority-generation.mjs";
import {
  sourceGit,
  sourceIdentity,
  sourceRead,
  sourceHash,
} from "./source-authority-evidence.mjs";
import { runVerificationTier } from "./verification-tier.js";
import {
  expectedSourceFloor,
  SOURCE_VERIFICATION_STAGE_IDS,
  SOURCE_QUALIFIER_DISPATCH_ENV,
  inspectSourceQualifierDispatch,
} from "./verification-scope.mjs";

describe("actual source consumers of a committed synthetic publication", () => {
  let fixture: Awaited<ReturnType<typeof requestFixture>>;
  let activated: ReturnType<typeof sourceIdentity>;
  beforeAll(async () => {
    fixture = await requestFixture();
    const checked = await review(fixture);
    await publishSourceAuthority({
      repositoryRoot: fixture.root,
      request: fixture.requestIdentity,
      reviewPermit: checked.permit,
    });
    sourceGit(fixture.root, [
      "add",
      "--",
      ...SOURCE_GENERATION_PATHS,
      SOURCE_PUBLICATION_EVIDENCE_PREFIX,
    ]);
    sourceGit(fixture.root, [
      "commit",
      "--quiet",
      "-m",
      "Synthetic source publication for native consumer boundary tests",
    ]);
    activated = sourceIdentity(fixture.root, true);
  }, 180_000);
  afterAll(cleanupSyntheticPublicationFixtures);

  // These are new native integration cases, separate from the original
  // publication deadlines. Each complete public invocation uses real process
  // supervision and retains raw observations even when it fails or times out.
  it.each([true, false])(
    "runs a native envelope with focused=%s and honest unavailable prerequisites",
    async (focused) => {
      const runId = focused
        ? "native-focused-consumer"
        : "native-full-consumer";
      const argv = [
        "scripts/verify.mjs",
        "--run-id",
        runId,
        ...(focused ? ["--stage", "contract-integrity"] : []),
      ];
      const environment: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      delete environment[SOURCE_QUALIFIER_DISPATCH_ENV];
      environment["npm_config_verify_deps_before_run"] = "error";
      const startedAt = new Date().toISOString();
      const execution = await superviseCommand({
        executable: process.execPath,
        args: argv,
        cwd: fixture.root,
        env: environment,
        timeoutMs: 300_000,
        killGraceMs: 5_000,
        outputLimitBytes: 16 * 1024 * 1024,
      });
      const observed: {
        path: string;
        bytes: number;
        sha256: string;
        contentsBase64: string;
      }[] = [];
      async function retain(prefix: string): Promise<void> {
        for (const entry of await readdir(resolve(fixture.root, prefix), {
          withFileTypes: true,
        })) {
          expect(entry.isSymbolicLink()).toBe(false);
          const path = prefix + entry.name;
          if (entry.isDirectory()) await retain(path + "/");
          else {
            const content = (await sourceRead(fixture.root, path))!;
            observed.push({
              path,
              bytes: content.length,
              sha256: sourceHash(content),
              contentsBase64: content.toString("base64"),
            });
          }
        }
      }
      await retain("artifacts/" + runId + "/");
      // Vitest's raw stdout is retained by the real command-owned test receipt;
      // this keeps all nested native observations after fixture cleanup.
      console.log(
        JSON.stringify({
          schemaVersion: "synthetic-publication-native-consumer-observation.v1",
          claim:
            "Actual native execution against a synthetic committed publication; no source qualification",
          startedAt,
          finishedAt: new Date().toISOString(),
          argv,
          timeoutMs: 300_000,
          candidate: activated,
          execution: {
            exitCode: execution.exitCode,
            signal: execution.signal,
            spawnError: execution.spawnError?.message ?? null,
            supervision: execution.supervision,
            stdoutBase64: execution.stdout.toString("base64"),
            stderrBase64: execution.stderr.toString("base64"),
          },
          files: observed,
        }),
      );
      expect(execution.spawnError).toBeNull();
      expect(execution.signal).toBeNull();
      expect(execution.supervision).toMatchObject({
        timedOut: false,
        outputLimitExceeded: false,
        streamsClosed: true,
        drainTimedOut: false,
      });
      expect(execution.exitCode).not.toBe(0);
      const report = JSON.parse(
        await readFile(
          resolve(fixture.root, "artifacts", runId, "result.json"),
          "utf8",
        ),
      );
      expect(report.schemaVersion).toBe("3.0.0");
      expect(report.completion.eligible).toBe(false);
      expect(report.scope.purpose).toBe(
        focused ? "candidate-support" : "full-source-qualification",
      );
      expect(report.scope.sourceCandidate).toMatchObject({
        gitCommit: activated.commit,
        gitTree: activated.tree,
        workingTreeDirty: false,
      });
      expect(report.status).not.toBe("PASS");
      const integrity = report.stages.find(
        (stage: { id: string }) => stage.id === "contract-integrity",
      );
      expect(integrity.status).not.toBe("PASS");
      expect(integrity.commands).toHaveLength(1);
      expect(integrity.commands[0].status).not.toBe("PASS");
      for (const id of [
        "source-approved-anchor",
        "source-stage-coverage",
        "source-command-and-claim",
      ])
        expect(
          integrity.checks.find((check: { id: string }) => check.id === id)
            .status,
        ).toBe("PASS");
      if (focused) {
        expect(report.scope.qualifierRun).toBeNull();
        expect(report.stages.map((stage: { id: string }) => stage.id)).toEqual([
          "environment",
          "contract-integrity",
        ]);
        expect(report.completion.reasons).toContain("focused_stage_selection");
      } else {
        expect(report.scope.qualifierRun).not.toBeNull();
        expect(report.stages.map((stage: { id: string }) => stage.id)).toEqual(
          SOURCE_VERIFICATION_STAGE_IDS,
        );
        const acceptance = report.stages.find(
          (stage: { id: string }) => stage.id === "source-acceptance",
        );
        expect(acceptance.status).toBe("NOT_READY");
        expect(
          acceptance.checks.find(
            (check: { id: string }) =>
              check.id === "source-qualification-authentication",
          ).status,
        ).toBe("NOT_READY");
      }
      expect(sourceIdentity(fixture.root, true)).toEqual(activated);
      expect(
        await sourceRead(fixture.root, SOURCE_STATE_PATH, true),
      ).toBeNull();
    },
    330_000,
  );

  it.each(["candidate", "milestone"] as const)(
    "binds actual %s dispatch and rejects synthetic exit-zero without a receipt",
    async (tier) => {
      const observed: string[] = [];
      const provider = trustedTestExecutionProvider(
        async (command, options) => {
          observed.push(command.id);
          expect(command.id).toBe("test-invariants");
          expect(options.timeoutMs).toBe(1_200_000);
          const stdoutPath = resolve(options.artifactDirectory, "stdout.log");
          const stderrPath = resolve(options.artifactDirectory, "stderr.log");
          await put(
            fixture.root,
            stdoutPath,
            Buffer.from(
              "Synthetic provider exit-zero without child evidence\n",
            ),
          );
          await put(fixture.root, stderrPath, Buffer.from(""));
          const now = new Date().toISOString();
          return {
            id: command.id,
            displayCommand: [command.executable, ...command.args].join(" "),
            status: "PASS",
            exitCode: 0,
            signal: null,
            startedAt: now,
            finishedAt: now,
            durationMs: 0,
            stdoutPath,
            stderrPath,
            stdoutSha256: sourceHash(await readFile(stdoutPath)),
            stderrSha256: sourceHash(await readFile(stderrPath)),
            parser: "exit-code",
            parsedArtifactPath: null,
            message: "Synthetic provider boundary only",
            receipt: null,
            receiptAbsenceReason: "Intentional unit-test omission",
          };
        },
      );
      const result = await runVerificationTier({
        repositoryRoot: fixture.root,
        tier,
        baseCommit: activated.commit,
        requireClean: true,
        executionProvider: provider,
      });
      expect(result.schemaVersion).toBe("2.0.0");
      expect(result.status).toBe("ERROR");
      expect(result.exitCode).toBe(3);
      expect(result).toHaveProperty("scope");
      if (!("scope" in result))
        throw new Error("Source dispatch lost its scope");
      expect(result.completionEligible).toBe(false);
      expect(result.scope.purpose).toBe(
        tier === "candidate"
          ? "candidate-support"
          : "full-source-qualification",
      );
      expect(result.scope.sourceCandidate).toMatchObject({
        gitCommit: activated.commit,
        gitTree: activated.tree,
        workingTreeDirty: false,
      });
      expect(result.actualCheckIds).toEqual([
        ...expectedSourceFloor().map((command) => command.id),
        ...(tier === "milestone" ? ["exact-readiness"] : []),
      ]);
      expect(observed).toEqual(["test-invariants"]);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        status: "ERROR",
        exitCode: 0,
        receipt: null,
      });
      expect(result.commands[0]!.message).toContain(
        "required command-owned receipt",
      );
      expect(result.exactVerification).toBeNull();
      const dispatchBytes = await sourceRead(
        fixture.root,
        "artifacts/verification-tiers/" +
          result.runId +
          "/source-qualifier-dispatch.json",
        true,
      );
      if (tier === "candidate") {
        expect(dispatchBytes).toBeNull();
        expect(result.scope.qualifierRun).toBeNull();
      } else {
        expect(dispatchBytes).not.toBeNull();
        const dispatch = inspectSourceQualifierDispatch(
          JSON.parse(dispatchBytes!.toString()),
          result.candidate,
          provider.identity,
        );
        expect(result.scope.qualifierRun).toEqual(dispatch.qualifierRun);
      }
      expect(sourceIdentity(fixture.root, true)).toEqual(activated);
      expect(
        await sourceRead(fixture.root, SOURCE_STATE_PATH, true),
      ).toBeNull();
    },
    180_000,
  );
});
