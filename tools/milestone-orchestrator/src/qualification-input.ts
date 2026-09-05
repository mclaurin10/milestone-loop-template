import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  inventoryContainerArtifacts,
  publishContainerArtifacts,
  type ContainerArtifactInventory,
} from "./container-artifacts.js";
import {
  isExecutionProviderIdentity,
  type ExecutionProviderIdentity,
} from "./execution-provider-identity.js";

export const QUALIFICATION_INPUT_DESTINATION = "/qualification-input" as const;
export const QUALIFICATION_INPUT_LIMITS = Object.freeze({
  maximumFiles: 256,
  maximumBytes: 4 * 1024 * 1024,
});

/** Selected and retained by the outer coordinator, never read as approval
 * from candidate-authored files. Supporting evidence cannot confer readiness. */
export interface QualificationBinding {
  readonly purpose: "candidate-support";
  readonly coordinatorId: string;
  readonly runId: string;
  readonly nonce: string;
  readonly source: { readonly commit: string; readonly tree: string };
  readonly authoritySha256: string;
  readonly fixtureSha256: string;
  readonly coverage: readonly string[];
  readonly platform: "linux" | "win32";
  readonly provider: ExecutionProviderIdentity;
  readonly producerId: string;
}

export interface QualificationEnvelope {
  readonly schemaVersion: "qualification-input.v1";
  readonly binding: QualificationBinding;
  readonly artifacts: ContainerArtifactInventory;
  readonly completion: { readonly eligible: false };
}

export interface TrustedQualificationInput {
  readonly directory: string;
  readonly envelopeSha256: string;
  readonly binding: QualificationBinding;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertQualificationBinding(
  value: unknown,
): asserts value is QualificationBinding {
  const digest = (input: unknown, length: number) =>
    typeof input === "string" &&
    new RegExp(`^[0-9a-f]{${length}}$`).test(input);
  const id = (input: unknown) =>
    typeof input === "string" && /^[a-z0-9][a-z0-9-]{7,79}$/.test(input);
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !==
      "authoritySha256,coordinatorId,coverage,fixtureSha256,nonce,platform,producerId,provider,purpose,runId,source" ||
    value["purpose"] !== "candidate-support" ||
    !id(value["coordinatorId"]) ||
    !id(value["runId"]) ||
    !digest(value["nonce"], 64) ||
    !record(value["source"]) ||
    Object.keys(value["source"]).sort().join(",") !== "commit,tree" ||
    !digest(value["source"]["commit"], 40) ||
    !digest(value["source"]["tree"], 40) ||
    !digest(value["authoritySha256"], 64) ||
    !digest(value["fixtureSha256"], 64) ||
    !Array.isArray(value["coverage"]) ||
    value["coverage"].length === 0 ||
    value["coverage"].length > 64 ||
    !value["coverage"].every(id) ||
    new Set(value["coverage"]).size !== value["coverage"].length ||
    !["linux", "win32"].includes(String(value["platform"])) ||
    !isExecutionProviderIdentity(value["provider"]) ||
    !value["provider"].completionEligible ||
    !digest(value["producerId"], 64)
  )
    throw new Error("Invalid trusted qualification binding.");
}

/** Authentication is the out-of-band digest and binding supplied by the
 * trusted caller. A self-consistent bundle alone is never authority. */
export async function validateQualificationInput(
  expected: TrustedQualificationInput,
): Promise<QualificationEnvelope> {
  assertQualificationBinding(expected.binding);
  if (!/^[0-9a-f]{64}$/.test(expected.envelopeSha256))
    throw new Error("Missing pinned qualification envelope digest.");
  const metadata = await lstat(expected.directory);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    resolve(await realpath(expected.directory)) !== resolve(expected.directory)
  )
    throw new Error(
      "Qualification input root must be an ordinary directory with stable realpath identity.",
    );
  let entries = 0;
  const boundDirectories = async (
    directory: string,
    depth: number,
  ): Promise<void> => {
    if (depth > 16)
      throw new Error("Qualification input directory depth exceeds its bound.");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 512)
        throw new Error("Qualification input entry count exceeds its bound.");
      if (entry.isSymbolicLink())
        throw new Error("Qualification input contains a symbolic link.");
      if (entry.isDirectory())
        await boundDirectories(resolve(directory, entry.name), depth + 1);
    }
  };
  await boundDirectories(expected.directory, 0);
  // Inventory before opening anything: reject links, excessive data and all
  // non-regular files, including a linked envelope or payload root.
  const inventory = await inventoryContainerArtifacts(
    expected.directory,
    QUALIFICATION_INPUT_LIMITS,
  );
  const envelopeFile = inventory.files.find(
    (file) => file.path === "envelope.json",
  );
  if (envelopeFile?.sha256 !== expected.envelopeSha256)
    throw new Error(
      "Qualification envelope digest does not match coordinator.",
    );
  const bytes = await readFile(resolve(expected.directory, "envelope.json"));
  if (sha256(bytes) !== expected.envelopeSha256)
    throw new Error("Qualification envelope changed during inspection.");
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !==
      "artifacts,binding,completion,schemaVersion" ||
    value["schemaVersion"] !== "qualification-input.v1" ||
    !isDeepStrictEqual(value["binding"], expected.binding) ||
    !isDeepStrictEqual(value["completion"], { eligible: false })
  )
    throw new Error("Qualification envelope does not match trusted bindings.");
  const files = inventory.files.filter((file) => file.path !== "envelope.json");
  const artifacts: ContainerArtifactInventory = {
    schemaVersion: "1.0.0",
    files,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  };
  // Compare paths as data; never resolve paths supplied by the envelope.
  if (!files.length || !isDeepStrictEqual(value["artifacts"], artifacts))
    throw new Error(
      "Qualification artifact inventory changed or is incomplete.",
    );
  return {
    schemaVersion: "qualification-input.v1",
    binding: expected.binding,
    artifacts,
    completion: { eligible: false },
  };
}

/** Publish into a fresh directory; the caller retains the returned pin. */
export async function publishQualificationInput(input: {
  readonly sourceDirectory: string;
  readonly destinationDirectory: string;
  readonly binding: QualificationBinding;
}): Promise<TrustedQualificationInput> {
  assertQualificationBinding(input.binding);
  const artifacts = await publishContainerArtifacts({
    sourceRoot: input.sourceDirectory,
    destinationRoot: input.destinationDirectory,
    limits: QUALIFICATION_INPUT_LIMITS,
  });
  const envelope: QualificationEnvelope = {
    schemaVersion: "qualification-input.v1",
    binding: input.binding,
    artifacts,
    completion: { eligible: false },
  };
  const bytes = `${JSON.stringify(envelope, null, 2)}\n`;
  await writeFile(resolve(input.destinationDirectory, "envelope.json"), bytes, {
    flag: "wx",
  });
  const expected: TrustedQualificationInput = {
    directory: resolve(input.destinationDirectory),
    envelopeSha256: sha256(bytes),
    binding: input.binding,
  };
  await validateQualificationInput(expected);
  return expected;
}
