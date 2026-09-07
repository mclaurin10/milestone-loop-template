import assert from "node:assert/strict";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { commandIdentity, writeReceipt } from "../../evidence.mjs";
import { ensureContainedDirectory } from "./path-safety.js";
import type { ControllerLease } from "./controller-lease.js";
import {
  assertSourceReviewPermit,
  type SourceReviewPermit,
} from "./source-authority-review.js";
import {
  sourceExactKeys,
  sourceFilePin,
  sourceGit,
  sourceRead,
  type inspectSourceReviewEvidence,
} from "./source-authority-evidence.mjs";
import {
  inspectSourceLeaseOwner,
  inspectSourcePublicationPacket,
} from "./source-authority-records.mjs";
import {
  SOURCE_PUBLICATION_EVIDENCE_PREFIX,
  type inspectSourceRequestPrerequisites,
} from "./source-authority-generation.mjs";
interface Publication {
  readonly result: {
    readonly invocation: {
      readonly commit: string;
      readonly tree: string;
      readonly branch: string;
    };
    readonly freshReviewReceiptSha256: string;
    readonly intentSha256: string;
    readonly lease: ReturnType<ControllerLease["ownershipPin"]>;
  };
  readonly intentBytes: Buffer;
  readonly eventBytes: Buffer;
  readonly review: Awaited<ReturnType<typeof inspectSourceReviewEvidence>>;
  readonly freshReview: Awaited<ReturnType<typeof inspectSourceReviewEvidence>>;
}
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n");

async function syncDirectory(path: string) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (
      process.platform !== "win32" ||
      !["EPERM", "EACCES", "EINVAL", "EISDIR"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      throw error;
  } finally {
    await handle?.close();
  }
}

async function exactWrite(root: string, path: string, contents: Buffer) {
  await ensureContainedDirectory(root, dirname(resolve(root, path)));
  const prior = await sourceRead(root, path, true);
  if (prior !== null) {
    assert(
      prior.equals(contents),
      "Foreign publication evidence was preserved: " + path,
    );
    return;
  }
  const handle = await open(resolve(root, path), "wx");
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(dirname(resolve(root, path)));
}

async function fixedPacketFiles(
  root: string,
  prefix = SOURCE_PUBLICATION_EVIDENCE_PREFIX,
): Promise<string[]> {
  const absolute = resolve(root, prefix);
  try {
    const info = await lstat(absolute);
    assert(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        (await realpath(absolute)) === absolute,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const paths: string[] = [];
  for (const name of await readdir(absolute)) {
    const path = prefix + name;
    const info = await lstat(resolve(root, path));
    assert(!info.isSymbolicLink());
    if (info.isDirectory())
      paths.push(...(await fixedPacketFiles(root, path + "/")));
    else {
      await sourceRead(root, path);
      paths.push(path.slice(SOURCE_PUBLICATION_EVIDENCE_PREFIX.length));
    }
  }
  return paths.sort();
}

/** Called by the real publisher while its mutation lease and review permit are
 * held. The export intent pins a complete packet before the first target write.
 * Recovery reuses exactly that packet, including the original raw observations;
 * it does not fabricate a replacement success report for an earlier attempt. */
export async function retainSourcePublicationPacket(input: {
  readonly root: string;
  readonly context: Awaited<
    ReturnType<typeof inspectSourceRequestPrerequisites>
  >;
  readonly publication: Publication;
  readonly lease: ControllerLease;
  readonly permit: SourceReviewPermit;
  readonly assertInputs: () => Promise<void>;
  readonly hooks?: {
    readonly beforeEvidenceFile?: (path: string) => Promise<void> | void;
    readonly afterEvidenceFile?: (path: string) => Promise<void> | void;
  };
}) {
  const { root, context, publication, lease, permit } = input;
  assert.equal(await realpath(root), root);
  const request = {
    commit: context.binding.requestCommit,
    sha256: context.binding.requestSha256,
  };
  const transaction =
    "artifacts/orchestrator/source-authority/" + request.sha256;
  const exportIntentPath = transaction + "/publication-evidence-intent.json";
  const boundary = async () => {
    await lease.assertHeld();
    await assertSourceReviewPermit(permit, root, request);
    await input.assertInputs();
    await lease.assertHeld();
  };
  await boundary();
  const existing = await sourceRead(root, exportIntentPath, true);
  let exportIntent: {
    schemaVersion: string;
    request: typeof request;
    intentSha256: string;
    packetPrefix: string;
    receiptSha256: string;
    files: {
      path: string;
      exists: boolean;
      bytes: number;
      sha256: string | null;
    }[];
  };
  if (existing === null) {
    assert.deepEqual(
      await fixedPacketFiles(root),
      [],
      "Unrecorded publication evidence was preserved.",
    );
    const identity = await commandIdentity(root);
    assert.equal(identity.nodeVersion, "v24.18.0");
    assert.equal(identity.pnpmVersion, "11.15.1");
    assert.equal(identity.gitCommit, publication.result.invocation.commit);
    assert.equal(identity.gitTree, publication.result.invocation.tree);
    const packetPrefix =
      transaction +
      "/publication-packets/" +
      publication.result.freshReviewReceiptSha256 +
      "/";
    assert.equal(
      await sourceRead(root, packetPrefix + "result.json", true),
      null,
      "An unrecorded completed export packet already exists; preserve and diagnose it.",
    );
    const files = new Map<string, { kind: string; contents: Buffer }>([
      [
        "publication.json",
        {
          kind: "source-authority-publication",
          contents: encode(publication.result),
        },
      ],
      [
        "completed-intent.json",
        {
          kind: "source-authority-publication-intent",
          contents: publication.intentBytes,
        },
      ],
      [
        "publication-events.jsonl",
        {
          kind: "source-authority-publication-events",
          contents: publication.eventBytes,
        },
      ],
      [
        "runtime.json",
        {
          kind: "source-authority-publication-runtime",
          contents: encode({
            schemaVersion: "source-authority-publication-runtime.v1",
            nodeVersion: identity.nodeVersion,
            pnpmVersion: identity.pnpmVersion,
            platform: process.platform,
            architecture: process.arch,
            invocation: publication.result.invocation,
            sourceStateAdopted: false,
          }),
        },
      ],
    ]);
    for (const review of [publication.review, publication.freshReview]) {
      const prefix = "reviews/" + review.sha256 + "/";
      files.set(prefix + "result.json", {
        kind: "source-authority-retained-review-receipt",
        contents: review.bytes,
      });
      for (const [path, file] of review.artifacts)
        files.set(prefix + path, { kind: file.kind, contents: file.contents });
    }
    const intent = JSON.parse(publication.intentBytes.toString());
    const events = publication.eventBytes
      .toString()
      .trimEnd()
      .split("\n")
      .map((line: string) => JSON.parse(line));
    const ownerIds = new Set<string>([
      intent.leaseAtCreation.objectId,
      publication.result.lease.objectId,
      ...events.map((row) => row.lease.objectId),
    ]);
    for (const id of ownerIds) {
      // The publisher retains each original owner before releasing its ref.
      // A fresh owner is also read directly from the actual held Git object.
      const retained = await sourceRead(
        root,
        transaction + "/lease-owners/" + id + ".json",
        true,
      );
      const contents = retained ?? sourceGit(root, ["cat-file", "blob", id]);
      inspectSourceLeaseOwner(contents, id);
      files.set("lease-owners/" + id + ".json", {
        kind: "source-authority-lease-owner",
        contents,
      });
    }
    for (const [path, file] of files)
      await exactWrite(root, packetPrefix + path, file.contents);
    await writeReceipt(
      {
        repositoryRoot: root,
        artifactDirectory: resolve(root, packetPrefix),
        stageId: "source-authority-publication",
        commandId: "loop:authority:migrate",
      },
      [
        {
          id: "leased-coherent-source-publication",
          summary:
            "The actual reviewed publisher completed its exact request under the existing lease and durable intent, retained the original state and all raw publication observations, and performed no commit or adoption.",
        },
      ],
      [...files].map(([path, file]) => ({ path, kind: file.kind })),
    );
    const checked = await inspectSourcePublicationPacket(
      root,
      context,
      packetPrefix,
    );
    assert.equal(checked.report.intentSha256, publication.result.intentSha256);
    const packetFiles = [...files.keys(), "result.json"].sort();
    for (const path of [...packetFiles, "manifest.json"]) {
      const handle = await open(resolve(root, packetPrefix + path), "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    exportIntent = {
      schemaVersion: "source-authority-publication-evidence-intent.v1",
      request,
      intentSha256: publication.result.intentSha256,
      packetPrefix,
      receiptSha256: checked.packet.sha256,
      files: await Promise.all(
        packetFiles.map(async (path) =>
          sourceFilePin(path, await sourceRead(root, packetPrefix + path)),
        ),
      ),
    };
    await boundary();
    await exactWrite(root, exportIntentPath, encode(exportIntent));
  } else exportIntent = JSON.parse(existing.toString());
  sourceExactKeys(exportIntent, [
    "schemaVersion",
    "request",
    "intentSha256",
    "packetPrefix",
    "receiptSha256",
    "files",
  ]);
  assert.equal(
    exportIntent.schemaVersion,
    "source-authority-publication-evidence-intent.v1",
  );
  assert.deepEqual(exportIntent.request, request);
  assert.equal(exportIntent.intentSha256, publication.result.intentSha256);
  assert(
    new RegExp("^" + transaction + "/publication-packets/[a-f0-9]{64}/$").test(
      exportIntent.packetPrefix,
    ),
  );
  const checked = await inspectSourcePublicationPacket(
    root,
    context,
    exportIntent.packetPrefix,
  );
  assert.equal(checked.packet.sha256, exportIntent.receiptSha256);
  assert.equal(checked.report.intentSha256, exportIntent.intentSha256);
  const expectedPaths = [
    ...checked.packet.artifacts.keys(),
    "result.json",
  ].sort();
  assert.deepEqual(
    exportIntent.files.map((file) => file.path),
    expectedPaths,
  );
  assert(
    (await fixedPacketFiles(root)).every((path) =>
      expectedPaths.includes(path),
    ),
    "Foreign undeclared publication evidence was preserved.",
  );
  const retainedTrace = checked.packet.artifacts.get(
    "publication-events.jsonl",
  )!.contents;
  assert(
    publication.eventBytes
      .subarray(0, retainedTrace.length)
      .equals(retainedTrace),
    "The completed publication event prefix changed before evidence recovery.",
  );
  const intentPin = sourceFilePin(
    exportIntentPath,
    await sourceRead(root, exportIntentPath),
  );
  // Receipt is published last; a partial fixed packet cannot be mistaken for a
  // committed generation and its exact files can be safely resumed.
  for (const path of [
    ...expectedPaths.filter((path) => path !== "result.json"),
    "result.json",
  ]) {
    await input.hooks?.beforeEvidenceFile?.(path);
    await boundary();
    assert.deepEqual(
      sourceFilePin(exportIntentPath, await sourceRead(root, exportIntentPath)),
      intentPin,
    );
    const contents = await sourceRead(root, exportIntent.packetPrefix + path);
    assert(contents);
    assert.deepEqual(
      sourceFilePin(path, contents),
      exportIntent.files.find((file) => file.path === path),
    );
    await exactWrite(root, SOURCE_PUBLICATION_EVIDENCE_PREFIX + path, contents);
    await input.hooks?.afterEvidenceFile?.(path);
  }
  await boundary();
  const fixed = await inspectSourcePublicationPacket(
    root,
    context,
    SOURCE_PUBLICATION_EVIDENCE_PREFIX,
  );
  assert.equal(fixed.packet.sha256, exportIntent.receiptSha256);
  assert.deepEqual(await fixedPacketFiles(root), expectedPaths);
  assert.equal(
    (
      await lstat(resolve(root, SOURCE_PUBLICATION_EVIDENCE_PREFIX))
    ).isDirectory(),
    true,
  );
  return {
    path: SOURCE_PUBLICATION_EVIDENCE_PREFIX + "result.json",
    sha256: fixed.packet.sha256,
    bytes: fixed.packet.bytes.length,
    completionEligible: false,
  };
}
