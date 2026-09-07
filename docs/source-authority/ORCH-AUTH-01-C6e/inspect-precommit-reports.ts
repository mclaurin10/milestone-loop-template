import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";
import {
  SOURCE_AUDIT_COMMANDS,
  sourceHistoricalFiles,
} from "../../../tools/milestone-orchestrator/src/source-authority-evidence.mjs";
import { inspectSourceAuditReports } from "../../../tools/milestone-orchestrator/src/source-authority-audit-reports.mjs";

/** Checks actual precommit report meanings against their real committed source.
 * The precommit job is not the separately required eight-command audit producer. */
export async function inspectPrecommitReports(input: {
  gitRepository: string;
  commandRoot: string;
  source: { commit: string; tree: string };
}) {
  const policyPath = "tools/source-release-policy.json";
  const policy = JSON.parse(
    sourceHistoricalFiles(input.gitRepository, input.source.commit, [
      policyPath,
    ])
      .get(policyPath)!
      .toString(),
  );
  const paths = [
    ...new Set<string>([
      policyPath,
      ...policy.payloadFiles,
      ...policy.sourceCheckFiles,
      "tools/milestone-orchestrator/config/test-ownership.json",
      "tools/milestone-orchestrator/config/invariant-suite.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ]),
  ];
  const implementationFiles = sourceHistoricalFiles(
    input.gitRepository,
    input.source.commit,
    paths,
  );
  type Expected = {
    stageId: string;
    commandId: string;
    requiredKinds?: string[];
  };
  const readReceipt = async (directory: string, expected: Expected) => {
    const rel = relative(input.commandRoot, directory);
    assert(!isAbsolute(rel) && !rel.split(/[\\/]/).includes(".."));
    const receipt = await validateCommandReceiptDirectory({
      directory,
      expectedStageId: expected.stageId,
      expectedCommandId: expected.commandId,
      requiredKinds: expected.requiredKinds,
    });
    const artifacts = new Map();
    for (const pin of receipt.artifacts) {
      const path = relative(directory, pin.path).replaceAll("\\", "/");
      artifacts.set(path, { ...pin, path, contents: await readFile(pin.path) });
    }
    const bytes = await readFile(receipt.receiptPath);
    return {
      receipt: JSON.parse(bytes.toString()),
      bytes,
      sha256: receipt.receiptSha256,
      artifacts,
    };
  };
  const reports = new Map();
  const commands = [];
  for (const expected of SOURCE_AUDIT_COMMANDS) {
    const directory = resolve(input.commandRoot, expected.id);
    const child = await readReceipt(directory, expected);
    const report = await inspectSourceAuditReports({
      expected,
      child,
      implementation: input.source,
      runtime: {
        nodeVersion: "v24.18.0",
        pnpmVersion: "11.15.1",
        platform: "linux",
        architecture: "x64",
      },
      implementationFiles,
      readNestedReceipt: (prefix: string, nested: Expected) =>
        readReceipt(resolve(directory, prefix), nested),
    });
    reports.set(expected.id, report);
    commands.push({ id: expected.id, receiptSha256: child.sha256 });
  }
  assert.deepEqual(
    reports.get("architecture").packageGraph,
    reports.get("dependencies").packageGraph,
  );
  return {
    source: input.source,
    commands,
    committedFiles: implementationFiles.size,
    reportMeaningsValidated: true,
    outerAuditTimingObserved: false,
    actualImplementationAudit: false,
    completionEligible: false,
  };
}
