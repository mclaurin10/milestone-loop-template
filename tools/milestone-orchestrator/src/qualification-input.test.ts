import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { trustedTestExecutionProviderIdentity } from "../test/fixtures.js";
import { runCommand } from "./command-runner.js";
import {
  inspectPlanningProducer,
  PLANNING_QUALIFICATION_CASES,
} from "./planning-qualification.js";
import {
  publishQualificationInput,
  QUALIFICATION_INPUT_LIMITS,
  validateQualificationInput,
  type QualificationBinding,
} from "./qualification-input.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

function binding(): QualificationBinding {
  return {
    purpose: "candidate-support",
    coordinatorId: "coordinator-unit",
    runId: "run-unit-input",
    nonce: "a".repeat(64),
    source: { commit: "b".repeat(40), tree: "c".repeat(40) },
    authoritySha256: "d".repeat(64),
    fixtureSha256: "e".repeat(64),
    coverage: PLANNING_QUALIFICATION_CASES,
    platform: "linux",
    provider: trustedTestExecutionProviderIdentity(),
    producerId: "f".repeat(64),
  };
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "qualification-input-"));
  roots.push(root);
  const source = resolve(root, "source");
  await mkdir(source);
  await writeFile(
    resolve(source, "observation.json"),
    '{"actual":"unit fixture only"}\n',
  );
  const input = await publishQualificationInput({
    sourceDirectory: source,
    destinationDirectory: resolve(root, "input"),
    binding: binding(),
  });
  return { root, source, input };
}

describe("qualification input authentication", () => {
  it("preserves a bounded independent copy with a caller-retained pin", async () => {
    const { source, input } = await fixture();
    await rm(source, { recursive: true });
    const envelope = await validateQualificationInput(input);
    expect(envelope.completion.eligible).toBe(false);
    expect(envelope.artifacts.fileCount).toBe(1);
  });

  it.each([
    ["stale nonce", { nonce: "0".repeat(64) }],
    ["cross-purpose", { purpose: "full-source-qualification" }],
    ["forged coordinator", { coordinatorId: "coordinator-forged" }],
    ["stale run", { runId: "run-other-invocation" }],
    [
      "changed source commit",
      { source: { commit: "0".repeat(40), tree: "c".repeat(40) } },
    ],
    [
      "changed source tree",
      { source: { commit: "b".repeat(40), tree: "0".repeat(40) } },
    ],
    ["changed authority", { authoritySha256: "0".repeat(64) }],
    ["changed fixture", { fixtureSha256: "0".repeat(64) }],
    ["omitted case", { coverage: [PLANNING_QUALIFICATION_CASES[0]] }],
    ["wrong platform", { platform: "win32" }],
    ["missing platform", { platform: undefined }],
    ["forged producer", { producerId: "0".repeat(64) }],
    [
      "forged provider",
      {
        provider: {
          ...trustedTestExecutionProviderIdentity(),
          controlPlaneBound: false,
        },
      },
    ],
  ])(
    "rejects %s even when the received envelope is repinned",
    async (_label, mutation) => {
      const { input } = await fixture();
      const path = resolve(input.directory, "envelope.json");
      const envelope = JSON.parse(await readFile(path, "utf8")) as {
        binding: object;
      };
      envelope.binding = { ...envelope.binding, ...mutation };
      const bytes = JSON.stringify(envelope);
      await writeFile(path, bytes);
      const envelopeSha256 = createHash("sha256").update(bytes).digest("hex");
      await expect(
        validateQualificationInput({ ...input, envelopeSha256 }),
      ).rejects.toThrow(/trusted bindings/);
    },
  );

  it("rejects a new self-consistent envelope without the outer pin", async () => {
    const { input } = await fixture();
    await writeFile(resolve(input.directory, "envelope.json"), "{}");
    await expect(validateQualificationInput(input)).rejects.toThrow(/digest/);
  });

  it.each([
    "alter",
    "omit",
    "extra",
    "hardlink",
    "directory-link",
    "traversal",
    "quota",
    "depth",
  ])("rejects %s input", async (kind) => {
    const { root, input } = await fixture();
    const path = resolve(input.directory, "observation.json");
    if (kind === "alter") await writeFile(path, "changed");
    if (kind === "omit") await rm(path);
    if (kind === "extra")
      await writeFile(resolve(input.directory, "extra"), "unexpected");
    if (kind === "hardlink") await link(path, resolve(root, "outside-link"));
    if (kind === "directory-link")
      await symlink(root, resolve(input.directory, "linked-root"), "junction");
    if (kind === "quota")
      await writeFile(
        path,
        Buffer.alloc(QUALIFICATION_INPUT_LIMITS.maximumBytes + 1),
      );
    if (kind === "depth")
      await mkdir(
        resolve(input.directory, ...Array<string>(18).fill("nested")),
        { recursive: true },
      );
    let expected = input;
    if (kind === "traversal") {
      const envelopePath = resolve(input.directory, "envelope.json");
      const envelope = JSON.parse(await readFile(envelopePath, "utf8")) as {
        artifacts: { files: { path: string }[] };
      };
      envelope.artifacts.files[0]!.path = "../outside.json";
      const bytes = JSON.stringify(envelope);
      await writeFile(envelopePath, bytes);
      expected = {
        ...input,
        envelopeSha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
    await expect(validateQualificationInput(expected)).rejects.toThrow();
  });

  it("does not accept an authenticated zero-exit report without a producer receipt", async () => {
    const { input } = await fixture();
    await expect(inspectPlanningProducer(input)).rejects.toThrow(
      /receipt is missing/,
    );
  });

  it("refuses the local runner instead of silently dropping the read-only input", async () => {
    const { root, input } = await fixture();
    const result = await runCommand(
      {
        id: "input-local-refusal",
        executable: "node",
        args: ["tools/qualification-planning.mjs", "produce"],
        parser: "exit-code",
      },
      {
        workingDirectory: root,
        artifactDirectory: resolve(root, "logs"),
        timeoutMs: 1_000,
        trustedControllerCommand: true,
        qualificationInput: input,
      },
    );
    expect(result.status).toBe("ERROR");
    expect(result.message).toMatch(/attested OCI executor/);
    expect(result.receipt).toBeNull();
  });
});
