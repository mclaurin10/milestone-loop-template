import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evidenceContext, commandIdentity, runPnpm, assertCommandPassed, writeJson, writeReceipt } from "../../tools/evidence.mjs";
import { validateCommandReceiptDirectory } from "../../tools/milestone-orchestrator/src/verifier.js";
process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = resolve("docs/runtime-qualification/ORCH-AUTH-01-C/evidence/record-check");
const context = await evidenceContext("orch-auth-01-c", "host-discovery-record-check");
const identity = await commandIdentity(context.repositoryRoot);
assert.equal(identity.nodeVersion, "v24.18.0");
assert.equal(identity.pnpmVersion, "11.15.1");
const prefix = "docs/runtime-qualification/ORCH-AUTH-01-C/";
const code = ["run-discovery.ts", "run-focused.ts", "verify-closeout.ts", "curate-evidence.ts"].map((name) => prefix + name);
const files = [...code, prefix + "README.md", ".agent/current-exec-plan.md"];
const hashes = await Promise.all(files.map(async (path) => ({
  path, sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
})));
const commands = [
  ["exec", "eslint", ...code],
  ["exec", "prettier", "--check", ...files],
];
const executions = [];
for (const argv of commands) {
  const result = await runPnpm(argv, { timeoutMs: 300_000 });
  executions.push({ argv: ["pnpm", ...argv], result });
  await writeJson(resolve(context.artifactDirectory, "record-check.json"), { identity, hashes, executions });
  assertCommandPassed(result, argv[1]);
}
for (const file of hashes)
  assert.equal(createHash("sha256").update(await readFile(file.path)).digest("hex"), file.sha256);
await writeFile(resolve(context.artifactDirectory, "procedure.ts"), await readFile(process.argv[1]!));
await writeReceipt(context, [{ id: "closeout-records-linted-and-formatted", summary: "Executed ESLint and Prettier against the exact closeout helpers and updated records, retaining their actual output and source hashes." }], [
  { path: "record-check.json", kind: "host-discovery-record-check" },
  { path: "procedure.ts", kind: "host-discovery-record-check-procedure" },
]);
await validateCommandReceiptDirectory({ directory: context.artifactDirectory, expectedStageId: context.stageId, expectedCommandId: context.commandId });
process.stdout.write("Record helper lint/format receipts validated.\n");
