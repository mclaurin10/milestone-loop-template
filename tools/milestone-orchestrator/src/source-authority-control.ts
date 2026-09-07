import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  assertCommandPassed,
  commandIdentity,
  evidenceContext,
  FULL_SUITE_EVIDENCE_TIMEOUT_MS,
  runPnpm,
  writeManualEvidenceFailure,
  writeReceipt,
} from "../../evidence.mjs";
import { assertActiveAuthorityPublication } from "./authority-publication.mjs";
import {
  SOURCE_AUDIT_COMMANDS,
  sourceIdentity,
} from "./source-authority-evidence.mjs";
import { prepareSourceAuthorityTransition } from "./source-authority-transition.js";
import { validateCommandReceiptDirectory } from "./verifier.js";

const controllerRoot = resolve(import.meta.dirname, "../../..");
async function freshContext(
  output: string,
  stageId: string,
  commandId: string,
) {
  const root = await realpath(controllerRoot),
    absolute = resolve(output);
  const path = relative(root, absolute).replaceAll("\\", "/");
  assert(
    path.startsWith("artifacts/") &&
      !path.split("/").includes("..") &&
      !existsSync(absolute),
    "Source control evidence requires a fresh contained artifacts directory.",
  );
  process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = absolute;
  const context = await evidenceContext(stageId, commandId);
  assert.equal(await realpath(context.repositoryRoot), root);
  return context;
}
async function inventory(
  directory: string,
  path = "",
): Promise<{ path: string; kind: string }[]> {
  const result: { path: string; kind: string }[] = [];
  for (const name of await readdir(resolve(directory, path))) {
    const child = path ? path + "/" + name : name,
      absolute = resolve(directory, child),
      info = await lstat(absolute);
    assert(!info.isSymbolicLink() && (await realpath(absolute)) === absolute);
    if (info.isDirectory()) result.push(...(await inventory(directory, child)));
    else {
      assert(info.isFile() && info.size <= 20_000_000);
      if (
        info.size > 0 &&
        child !== "result.json" &&
        child !== "manifest.json" &&
        !child.startsWith("manual-evidence")
      )
        result.push({
          path: child,
          kind: "source-authority-audit-raw-evidence",
        });
    }
  }
  return result;
}

/** Runs the real source implementation checks from its own clean controller
 * checkout. No caller supplies replacement commands or successful receipts. */
export async function auditSourceAuthorityImplementation(input: {
  readonly snapshotCommit: string;
  readonly artifactDirectory: string;
}) {
  const context = await freshContext(
    input.artifactDirectory,
    "source-authority-implementation",
    "source-authority-audit",
  );
  try {
    const root = context.repositoryRoot;
    assert.equal(await assertActiveAuthorityPublication(root), "legacy");
    const implementation = sourceIdentity(root, true),
      identity = await commandIdentity(root);
    assert.equal(identity.nodeVersion, "v24.18.0");
    assert.equal(identity.pnpmVersion, "11.15.1");
    const projection = await prepareSourceAuthorityTransition({
      repositoryRoot: root,
      snapshotCommit: input.snapshotCommit,
    });
    const { files, ...inspection } = projection;
    const commands = [];
    for (const expected of SOURCE_AUDIT_COMMANDS) {
      assert.deepEqual(sourceIdentity(root, true), implementation);
      assert.equal(await assertActiveAuthorityPublication(root), "legacy");
      const directory = resolve(
        context.artifactDirectory,
        "commands",
        expected.id,
      );
      await mkdir(directory, { recursive: true });
      const startedAt = new Date().toISOString();
      const result = await runPnpm(expected.argv.slice(1), {
        cwd: root,
        timeoutMs: FULL_SUITE_EVIDENCE_TIMEOUT_MS,
        env: {
          ...process.env,
          LOOP_VERIFY_COMMAND_ARTIFACT_DIR: directory,
          LOOP_VERIFY_STAGE_ID: expected.stageId,
          LOOP_VERIFY_COMMAND_ID: expected.commandId,
        },
      });
      const finishedAt = new Date().toISOString();
      await writeFile(
        resolve(directory, "audit-child-stdout.log"),
        result.stdout ?? "",
      );
      await writeFile(
        resolve(directory, "audit-child-stderr.log"),
        result.stderr ?? "",
      );
      await writeFile(
        resolve(directory, "audit-child-execution.json"),
        JSON.stringify(
          {
            schemaVersion: "source-authority-audit-execution.v1",
            implementation,
            argv: expected.argv,
            timeoutMs: FULL_SUITE_EVIDENCE_TIMEOUT_MS,
            startedAt,
            finishedAt,
            exitCode: result.status,
            signal: result.signal,
            error: result.error?.message ?? null,
            supervision: result.supervision ?? null,
          },
          null,
          2,
        ) + "\n",
      );
      assertCommandPassed(result, "Source implementation audit " + expected.id);
      const receipt = await validateCommandReceiptDirectory({
        directory,
        expectedStageId: expected.stageId,
        expectedCommandId: expected.commandId,
        requiredKinds: expected.requiredKinds,
      });
      commands.push({
        ...expected,
        exitCode: result.status,
        startedAt,
        finishedAt,
        receipt: {
          path: "commands/" + expected.id + "/result.json",
          bytes: receipt.receiptBytes,
          sha256: receipt.receiptSha256,
        },
      });
      assert.deepEqual(sourceIdentity(root, true), implementation);
    }
    for (const file of files) {
      const path = resolve(
        context.artifactDirectory,
        "proposed-root",
        file.path,
      );
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.contents, { flag: "wx" });
    }
    await writeFile(
      resolve(context.artifactDirectory, "transition-inspection.json"),
      JSON.stringify(inspection, null, 2) + "\n",
      { flag: "wx" },
    );
    const report = {
      schemaVersion: "source-authority-implementation-audit.v1",
      status: "PASS",
      completionEligible: false,
      implementation,
      runtime: {
        nodeVersion: identity.nodeVersion,
        pnpmVersion: identity.pnpmVersion,
        platform: process.platform,
        architecture: process.arch,
      },
      subjectSha256: projection.subjectSha256,
      commands,
    };
    await writeFile(
      resolve(context.artifactDirectory, "audit.json"),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
    const artifacts = (await inventory(context.artifactDirectory)).map(
      (file) => ({
        ...file,
        kind:
          file.path === "audit.json"
            ? "source-authority-implementation-audit"
            : file.path === "transition-inspection.json"
              ? "source-authority-transition-inspection"
              : file.kind,
      }),
    );
    assert.deepEqual(sourceIdentity(root, true), implementation);
    assert.equal(await assertActiveAuthorityPublication(root), "legacy");
    await writeReceipt(
      context,
      [
        {
          id: "real-source-implementation-commands",
          summary:
            "Every fixed source implementation command executed and produced independently validated command-owned artifacts at the exact clean implementation commit. This is not readiness or publication approval.",
        },
      ],
      artifacts,
    );
    return await validateCommandReceiptDirectory({
      directory: context.artifactDirectory,
      expectedStageId: context.stageId,
      expectedCommandId: context.commandId,
      requiredKinds: [
        "source-authority-implementation-audit",
        "source-authority-transition-inspection",
      ],
    });
  } catch (error) {
    await writeManualEvidenceFailure(context, {
      kind: "product",
      message: String(error),
    });
    throw error;
  }
}

export { reviewSourceAuthorityRequest } from "./source-authority-review.js";
