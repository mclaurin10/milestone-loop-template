import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  put,
  requestFixture,
  review,
  cleanupSyntheticPublicationFixtures,
} from "../test/synthetic-source-publication.js";
import { AUTHORITY_MIGRATION_PENDING_PATH } from "./authority-publication.mjs";
import {
  publishSourceAuthority,
  sourceTransactionPaths,
  SOURCE_STATE_PATH,
  type SourcePublicationHooks,
} from "./source-authority-publication.js";
import { assertSourceReviewPermit } from "./source-authority-review.js";
import {
  sourceFilePin,
  sourceGitText,
  sourceHash,
  sourceIdentity,
  sourceRead,
} from "./source-authority-evidence.mjs";
import { SOURCE_PUBLICATION_EVIDENCE_PREFIX } from "./source-authority-generation.mjs";
afterEach(cleanupSyntheticPublicationFixtures);

describe.each(["afterStaged", "beforeIntent"] as const)(
  "actual retry after %s with synthetic SDK input",
  (phase) => {
    let fixture: Awaited<ReturnType<typeof requestFixture>>;
    let originalReview: Awaited<ReturnType<typeof review>>;
    let originalEvents: Buffer;
    beforeEach(async () => {
      fixture = await requestFixture();
      originalReview = await review(fixture);
      let reached = false;
      const hooks: SourcePublicationHooks = {
        [phase]: () => {
          reached = true;
          throw new Error("Interrupted before source intent: " + phase);
        },
      };
      await expect(
        publishSourceAuthority({
          repositoryRoot: fixture.root,
          request: fixture.requestIdentity,
          reviewPermit: originalReview.permit,
          hooks,
        }),
      ).rejects.toThrow("Interrupted before source intent: " + phase);
      expect(reached).toBe(true);
      const paths = sourceTransactionPaths(fixture.requestIdentity.sha256);
      originalEvents = (await sourceRead(fixture.root, paths.events))!;
      expect(originalEvents.length).toBeGreaterThan(0);
      expect(
        await sourceRead(fixture.root, AUTHORITY_MIGRATION_PENDING_PATH, true),
      ).toBeNull();
      expect(
        await sourceRead(fixture.root, paths.completedIntent, true),
      ).toBeNull();
      expect(
        await sourceRead(
          fixture.root,
          SOURCE_PUBLICATION_EVIDENCE_PREFIX + "result.json",
          true,
        ),
      ).toBeNull();
      for (const output of fixture.request.outputs)
        expect(
          sourceFilePin(
            output.path,
            await sourceRead(fixture.root, output.path, true),
          ),
        ).toEqual(output.prior);
      expect(sourceIdentity(fixture.root, true)).toEqual(fixture.identity);
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
    it("retains the first attempt and review while a fresh actual lease completes publication", async () => {
      const fresh = await review(fixture);
      const published = await publishSourceAuthority({
        repositoryRoot: fixture.root,
        request: fixture.requestIdentity,
        reviewPermit: fresh.permit,
      });
      expect(published.result.status).toBe("PASS");
      expect(published.result.completionEligible).toBe(false);
      expect(published.result.reviewReceiptSha256).toBe(
        originalReview.receipt.receiptSha256,
      );
      expect(published.result.freshReviewReceiptSha256).toBe(
        fresh.receipt.receiptSha256,
      );
      expect(published.result.freshReviewReceiptSha256).not.toBe(
        published.result.reviewReceiptSha256,
      );
      expect(published.eventBytes.subarray(0, originalEvents.length)).toEqual(
        originalEvents,
      );
      const rows = published.eventBytes
        .toString()
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(rows.filter((row) => row.event === "attempt-start")).toHaveLength(
        2,
      );
      expect(
        rows.filter((row) => row.event === "intent-published"),
      ).toHaveLength(1);
      expect(new Set(rows.map((row) => row.intentSha256))).toEqual(
        new Set([sourceHash(published.intentBytes)]),
      );
      expect(rows[0].lease.objectId).not.toBe(rows.at(-1).lease.objectId);
      expect(sourceIdentity(fixture.root)).toEqual(fixture.identity);
      expect(
        await sourceRead(fixture.root, SOURCE_STATE_PATH, true),
      ).toBeNull();
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
      expect(
        await sourceRead(fixture.root, published.receipt.path),
      ).not.toBeNull();
    }, 180_000);
  },
);

describe.each([
  "afterIntentWrite",
  "beforeEvidenceFile",
  "afterEvidenceFile",
] as const)(
  "actual interrupted source boundary %s with synthetic SDK input",
  (phase) => {
    let fixture: Awaited<ReturnType<typeof requestFixture>>;
    let firstReview: Awaited<ReturnType<typeof review>>;
    let intentBytes: Buffer;
    let initialEvents: Buffer;
    let exportIntent: { receiptSha256: string; packetPrefix: string } | null;
    beforeEach(async () => {
      fixture = await requestFixture();
      firstReview = await review(fixture);
      let reached = false;
      let copiedPath: string | null = null;
      const hooks: SourcePublicationHooks = {
        [phase]: (path?: string) => {
          reached = true;
          copiedPath = path ?? null;
          throw new Error("Interrupted actual source boundary: " + phase);
        },
      };
      await expect(
        publishSourceAuthority({
          repositoryRoot: fixture.root,
          request: fixture.requestIdentity,
          reviewPermit: firstReview.permit,
          hooks,
        }),
      ).rejects.toThrow("Interrupted actual source boundary: " + phase);
      expect(reached).toBe(true);
      const paths = sourceTransactionPaths(fixture.requestIdentity.sha256);
      const pending = await sourceRead(
        fixture.root,
        AUTHORITY_MIGRATION_PENDING_PATH,
        true,
      );
      const complete = await sourceRead(
        fixture.root,
        paths.completedIntent,
        true,
      );
      intentBytes = (pending ?? complete)!;
      expect(intentBytes).not.toBeNull();
      expect(pending !== null).toBe(phase === "afterIntentWrite");
      expect(complete !== null).toBe(phase !== "afterIntentWrite");
      initialEvents = (await sourceRead(fixture.root, paths.events))!;
      const exported = await sourceRead(
        fixture.root,
        paths.directory + "/publication-evidence-intent.json",
        true,
      );
      exportIntent = exported === null ? null : JSON.parse(exported.toString());
      expect(exportIntent !== null).toBe(phase !== "afterIntentWrite");
      expect(
        await sourceRead(
          fixture.root,
          SOURCE_PUBLICATION_EVIDENCE_PREFIX + "result.json",
          true,
        ),
      ).toBeNull();
      if (copiedPath !== null) {
        const fixed = await sourceRead(
          fixture.root,
          SOURCE_PUBLICATION_EVIDENCE_PREFIX + copiedPath,
          true,
        );
        if (phase === "beforeEvidenceFile") expect(fixed).toBeNull();
        else
          expect(fixed).toEqual(
            await sourceRead(
              fixture.root,
              exportIntent!.packetPrefix + copiedPath,
            ),
          );
      }
      for (const output of fixture.request.outputs)
        expect(
          sourceFilePin(
            output.path,
            await sourceRead(fixture.root, output.path, true),
          ),
        ).toEqual(
          phase === "afterIntentWrite"
            ? output.prior
            : { path: output.path, exists: true, ...output.next },
        );
      await expect(
        assertSourceReviewPermit(
          firstReview.permit,
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
    it("resumes the exact intent and packet while retaining the fresh review and actual owner", async () => {
      const fresh = await review(fixture);
      const result = await publishSourceAuthority({
        repositoryRoot: fixture.root,
        request: fixture.requestIdentity,
        reviewPermit: fresh.permit,
      });
      expect(result.result).toMatchObject({
        status: "PASS",
        resumed: true,
        completionEligible: false,
        commitRequired: true,
      });
      expect(result.intentBytes).toEqual(intentBytes);
      expect(result.eventBytes.subarray(0, initialEvents.length)).toEqual(
        initialEvents,
      );
      expect(result.result.reviewReceiptSha256).toBe(
        firstReview.receipt.receiptSha256,
      );
      expect(result.result.freshReviewReceiptSha256).toBe(
        fresh.receipt.receiptSha256,
      );
      expect(result.result.freshReviewReceiptSha256).not.toBe(
        result.result.reviewReceiptSha256,
      );
      const paths = sourceTransactionPaths(fixture.requestIdentity.sha256);
      const freshReceipt = await sourceRead(
        fixture.root,
        paths.reviews + "/" + fresh.receipt.receiptSha256 + "/result.json",
      );
      expect(sourceHash(freshReceipt!)).toBe(fresh.receipt.receiptSha256);
      expect(
        await sourceRead(
          fixture.root,
          paths.directory +
            "/lease-owners/" +
            result.result.lease.objectId +
            ".json",
        ),
      ).not.toBeNull();
      if (exportIntent !== null)
        expect(result.receipt.sha256).toBe(exportIntent.receiptSha256);
      expect(
        sourceHash((await sourceRead(fixture.root, result.receipt.path))!),
      ).toBe(result.receipt.sha256);
      const rows = result.eventBytes
        .toString()
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(rows.filter((row) => row.event === "attempt-start")).toHaveLength(
        2,
      );
      expect(
        rows.filter((row) =>
          ["intent-published", "intent-observed-durable"].includes(row.event),
        ),
      ).toHaveLength(1);
      if (phase === "afterIntentWrite") {
        expect(rows.some((row) => row.event === "intent-published")).toBe(
          false,
        );
        expect(
          rows.find((row) => row.event === "intent-observed-durable").lease,
        ).toEqual(result.result.lease);
      }
      expect(sourceIdentity(fixture.root)).toEqual(fixture.identity);
      expect(
        await sourceRead(fixture.root, SOURCE_STATE_PATH, true),
      ).toBeNull();
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
    }, 180_000);
  },
);

it("preserves foreign evidence bytes introduced at the real fixed-file export boundary", async () => {
  const fixture = await requestFixture();
  const checked = await review(fixture);
  let reached: string | null = null;
  const foreign = Buffer.from("Foreign evidence must remain intact\n");
  await expect(
    publishSourceAuthority({
      repositoryRoot: fixture.root,
      request: fixture.requestIdentity,
      reviewPermit: checked.permit,
      hooks: {
        beforeEvidenceFile: async (path) => {
          expect(reached).toBeNull();
          reached = path;
          await put(
            fixture.root,
            SOURCE_PUBLICATION_EVIDENCE_PREFIX + path,
            foreign,
          );
        },
      },
    }),
  ).rejects.toThrow("Foreign publication evidence was preserved");
  expect(reached).not.toBeNull();
  expect(
    await sourceRead(
      fixture.root,
      SOURCE_PUBLICATION_EVIDENCE_PREFIX + reached,
    ),
  ).toEqual(foreign);
  expect(
    await sourceRead(
      fixture.root,
      SOURCE_PUBLICATION_EVIDENCE_PREFIX + "result.json",
      true,
    ),
  ).toBeNull();
  expect(sourceIdentity(fixture.root)).toEqual(fixture.identity);
  expect(await sourceRead(fixture.root, SOURCE_STATE_PATH, true)).toBeNull();
  expect(
    sourceGitText(
      fixture.root,
      "for-each-ref",
      "--format=%(refname)",
      "refs/milestone-loop/",
    ),
  ).toBe("");
}, 180_000);
