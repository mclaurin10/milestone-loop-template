import assert from "node:assert/strict";
import { cp, readFile, writeFile, appendFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  runPnpm,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
const [hostArg, guestArg, ociArg, outputArg] = process.argv.slice(2);
assert(hostArg && guestArg && ociArg && outputArg && process.argv.length === 6);
assert.equal(process.version, "v24.18.0");
const output = resolve(outputArg);
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "orch-auth-c3-negative-audit",
  "retained-host-tamper-refusal",
);
try {
  await inventoryContainerArtifacts(resolve(hostArg), {
    maximumFiles: 512,
    maximumBytes: 128 * 1024 * 1024,
  });
  const results = [];
  for (const name of ["qmp-policy", "cleanup", "archive-byte"]) {
    const target = resolve(output, name, "host"),
      audit = resolve(output, name, "audit");
    await cp(resolve(hostArg), target, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    if (name === "qmp-policy") {
      const file = resolve(target, "qmp.json"),
        raw = JSON.parse(await readFile(file, "utf8"));
      const request = raw.find(
        (e: any) => e.direction === "sent" && e.value.execute === "qom-get",
      );
      const response = raw.find(
        (e: any) =>
          e.direction === "received" && e.value.id === request.value.id,
      );
      assert.equal(response.value.return, 16);
      response.value.return = 64;
      await writeFile(file, JSON.stringify(raw, null, 2) + "\n");
    } else if (name === "cleanup") {
      const file = resolve(target, "host.json"),
        raw = JSON.parse(await readFile(file, "utf8"));
      assert.equal(raw.cleanupVerified, true);
      raw.cleanupVerified = false;
      await writeFile(file, JSON.stringify(raw, null, 2) + "\n");
    } else
      await appendFile(
        resolve(target, "guest-evidence.tar.gz"),
        Buffer.from([10]),
      );
    const argv = [
      "exec",
      "tsx",
      "docs/runtime-qualification/ORCH-AUTH-01-C3/audit-host.ts",
      target,
      resolve(guestArg),
      resolve(ociArg),
      audit,
    ];
    const execution = await runPnpm(argv, {
      cwd: context.repositoryRoot,
      timeoutMs: 120000,
    });
    await writeFile(resolve(output, name, "stdout.log"), execution.stdout);
    await writeFile(resolve(output, name, "stderr.log"), execution.stderr);
    assert.equal(execution.status, 1);
    assert.match(execution.stderr.toString(), /AssertionError/);
    let receiptPresent = true;
    try {
      await access(resolve(audit, "result.json"));
    } catch (error: any) {
      assert.equal(error.code, "ENOENT");
      receiptPresent = false;
    }
    assert.equal(receiptPresent, false);
    const inventory = await inventoryContainerArtifacts(resolve(output, name), {
      maximumFiles: 1024,
      maximumBytes: 128 * 1024 * 1024,
    });
    results.push({
      name,
      argv,
      exitCode: execution.status,
      receiptPresent,
      inventory,
    });
  }
  await writeFile(
    resolve(output, "negative-audit.json"),
    JSON.stringify(
      {
        status: "PASS",
        claimScope: "retained-evidence-tamper-refusal",
        candidateMutationProof: false,
        completionEligible: false,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(
    context,
    [
      {
        id: "MUTATED-HOST-EVIDENCE-REFUSED",
        summary:
          "The real independent host auditor rejected changed QMP policy, false cleanup, and a one-byte archive mutation without a PASS receipt. These are retained-evidence regressions, not candidate 5(a)/5(b) proofs.",
      },
    ],
    [{ path: "negative-audit.json", kind: "host-tamper-refusal" }],
  );
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      rejections: results.length,
      completionEligible: false,
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
