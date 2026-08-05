import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { evidenceContext, writeReceipt } from "../../evidence.mjs";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "receipt-hardening-"));
  temporaryDirectories.push(directory);
  return directory;
}

const check = { id: "check-1", summary: "Fixture check passed." };

describe("writeReceipt hardening", () => {
  it("rejects hollow or escaping receipts before writing anything", async () => {
    const directory = await temporaryDirectory();
    const context = {
      artifactDirectory: directory,
      stageId: "hardening",
      commandId: "hardening-command",
    };
    await writeFile(join(directory, "report.json"), "{}\n", "utf8");
    const artifact = { path: "report.json", kind: "fixture-report" };

    await expect(writeReceipt(context, [], [artifact])).rejects.toThrow(
      /at least one passing check/,
    );
    await expect(
      writeReceipt(context, [{ id: " ", summary: "x" }], [artifact]),
    ).rejects.toThrow(/nonempty id/);
    await expect(
      writeReceipt(context, [check, { ...check }], [artifact]),
    ).rejects.toThrow(/check ids must be unique/);
    await expect(
      writeReceipt(context, [{ id: "check-1", summary: " " }], [artifact]),
    ).rejects.toThrow(/nonempty summary/);
    await expect(writeReceipt(context, [check], [])).rejects.toThrow(
      /at least one command-owned artifact/,
    );
    await expect(
      writeReceipt(context, [check], [{ path: "result.json", kind: "k" }]),
    ).rejects.toThrow(/result\.json/);
    await expect(
      writeReceipt(context, [check], [{ path: "../escape.json", kind: "k" }]),
    ).rejects.toThrow(/escapes the artifact directory/);
    await expect(
      writeReceipt(context, [check], [artifact, { ...artifact }]),
    ).rejects.toThrow(/artifact paths must be unique/);
    await expect(
      writeReceipt(context, [check], [{ path: "report.json", kind: " " }]),
    ).rejects.toThrow(/nonempty kind/);

    expect(existsSync(join(directory, "result.json"))).toBe(false);
  });

  it("writes a validated receipt for well-formed inputs", async () => {
    const directory = await temporaryDirectory();
    const previous = {
      stage: process.env["LOOP_VERIFY_STAGE_ID"],
      command: process.env["LOOP_VERIFY_COMMAND_ID"],
      artifactDirectory: process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"],
    };
    process.env["LOOP_VERIFY_STAGE_ID"] = "hardening-fixture";
    process.env["LOOP_VERIFY_COMMAND_ID"] = "hardening-command";
    process.env["LOOP_VERIFY_COMMAND_ARTIFACT_DIR"] = directory;
    try {
      const context = await evidenceContext(
        "fallback-stage",
        "fallback-command",
      );
      await writeFile(
        join(directory, "report.json"),
        '{"status":"PASS"}\n',
        "utf8",
      );
      await writeReceipt(
        context,
        [check],
        [{ path: "report.json", kind: "fixture-report" }],
      );
    } finally {
      for (const [key, value] of [
        ["LOOP_VERIFY_STAGE_ID", previous.stage],
        ["LOOP_VERIFY_COMMAND_ID", previous.command],
        ["LOOP_VERIFY_COMMAND_ARTIFACT_DIR", previous.artifactDirectory],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    const receipt = JSON.parse(
      await readFile(join(directory, "result.json"), "utf8"),
    ) as unknown;
    expect(receipt).toMatchObject({
      schemaVersion: "1.0.0",
      stageId: "hardening-fixture",
      commandId: "hardening-command",
      status: "PASS",
      checks: [{ id: "check-1", status: "PASS" }],
      artifacts: [{ path: "report.json", kind: "fixture-report" }],
    });
  });
});
