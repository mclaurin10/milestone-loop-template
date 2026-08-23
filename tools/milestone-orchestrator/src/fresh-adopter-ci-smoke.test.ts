import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertFreshAdopterCommandLedger,
  assertFreshAdopterQuickstartPlan,
  assertGeneratedRepositoryObservation,
  createCanonicalFreshAdopterTemporaryRoot,
  createFreshAdopterCommandLedger,
  createFreshAdopterQuickstartPlan,
  generatedOfflineInstallArguments,
  parseFreshAdopterSmokeArguments,
  parsePnpmStorePath,
  resolveSourcePnpmStorePath,
  type FreshAdopterCommandLedgerEntry,
  type FreshAdopterQuickstartCommand,
  type GeneratedRepositoryObservation,
} from "../ci/fresh-adopter-smoke.js";

const commit = "a".repeat(40);
const tree = "b".repeat(40);

function planInput(): {
  definitionPath: string;
  definitionDisplayPath: string;
  repositoryRoot: string;
  sourceStorePath: string;
} {
  return {
    definitionPath: resolve(tmpdir(), "source", "definition.json"),
    definitionDisplayPath: "fixtures/fresh-adopter/definition.json",
    repositoryRoot: resolve(tmpdir(), "generated-adopter"),
    sourceStorePath: resolve(tmpdir(), "source-pnpm-store", "v11"),
  };
}

function repositoryObservation(): GeneratedRepositoryObservation {
  return {
    branch: "main",
    commitCount: 3,
    status: "",
    defaultProfile: "bootstrap",
    packageManager: "pnpm@11.15.1",
    readinessMarkerTree: false,
    readinessMarkerHistory: false,
    configuredUserName: "Fixture Maintainer",
    configuredUserEmail: "maintainer@example.invalid",
    manifestCommit: {
      commit,
      tree,
      subject: "activate bootstrap verification manifest",
      authorName: "Fixture Maintainer",
      authorEmail: "maintainer@example.invalid",
      authorDate: "2026-08-15T19:02:00.000Z",
      committerName: "Fixture Maintainer",
      committerEmail: "maintainer@example.invalid",
      committerDate: "2026-08-15T19:02:00.000Z",
    },
  };
}

describe("fresh-adopter CI smoke", () => {
  it("canonicalizes the coordinator-owned temporary root once at creation", async () => {
    const shortRoot =
      "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\fresh-adopter-ci-test";
    const canonicalRoot =
      "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\fresh-adopter-ci-test";
    const calls: string[] = [];

    await expect(
      createCanonicalFreshAdopterTemporaryRoot({
        createTemporaryRoot: async (prefix) => {
          calls.push(`create:${prefix}`);
          return shortRoot;
        },
        canonicalizeTemporaryRoot: async (path) => {
          calls.push(`canonicalize:${path}`);
          return canonicalRoot;
        },
      }),
    ).resolves.toBe(canonicalRoot);
    expect(calls).toEqual([
      `create:${join(tmpdir(), "fresh-adopter-ci-")}`,
      `canonicalize:${shortRoot}`,
    ]);
  });

  it("parses the strict two-path CLI", () => {
    expect(
      parseFreshAdopterSmokeArguments([
        "--definition",
        "fixtures/fresh-adopter/definition.json",
        "--output",
        "artifacts/ci/fresh-adopter/smoke",
      ]),
    ).toEqual({
      definitionPath: "fixtures/fresh-adopter/definition.json",
      outputPath: "artifacts/ci/fresh-adopter/smoke",
    });
    expect(() =>
      parseFreshAdopterSmokeArguments([
        "--definition",
        "fixtures/fresh-adopter/definition.json",
      ]),
    ).toThrow(/requires --definition.*--output/u);
    expect(() =>
      parseFreshAdopterSmokeArguments([
        "--definition",
        "first.json",
        "--definition",
        "second.json",
        "--output",
        "artifacts/ci/smoke",
      ]),
    ).toThrow(/only once/u);
  });

  it("plans every documented quickstart command once and in order", () => {
    const input = planInput();
    const commands = createFreshAdopterQuickstartPlan(input);
    expect(commands.map((command) => command.id)).toEqual([
      "template-create",
      "install",
      "commission",
      "manifest-add",
      "manifest-commit",
      "no-argument-verify",
    ]);
    expect(commands.map((command) => command.displayArgv)).toEqual([
      [
        "pnpm",
        "loop:template:create",
        "--",
        "--definition",
        "fixtures/fresh-adopter/definition.json",
        "--output",
        "<generated-repository>",
      ],
      [
        "pnpm",
        "install",
        "--offline",
        "--frozen-lockfile",
        "--package-import-method=copy",
        "--store-dir",
        "<source-pnpm-store>",
      ],
      [
        "pnpm",
        "loop:commission",
        "--",
        "--input",
        "tools/milestone-orchestrator/config/commissioning-input.json",
      ],
      ["git", "add", ".agent/verification-manifest.json"],
      ["git", "commit", "-m", "activate bootstrap verification manifest"],
      ["pnpm", "verify"],
    ]);
    expect(
      commands.some((command) =>
        ["typecheck", "test:unit"].includes(command.argv[1] ?? ""),
      ),
    ).toBe(false);

    const captures = commands.map((command, index) => ({
      id: command.id,
      durationMs: index + 1,
      exitCode: 0,
      stdout: "",
      stderr: "",
    }));
    const ledger = createFreshAdopterCommandLedger(commands, captures);
    expect(ledger.map((entry) => entry.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ledger.every((entry) => entry.status === "PASS")).toBe(true);
  });

  it("fails closed on quickstart order, count, ledger, or source-verify drift", () => {
    const input = planInput();
    const commands = createFreshAdopterQuickstartPlan(input);
    const reordered = [commands[1]!, commands[0]!, ...commands.slice(2)];
    expect(() => assertFreshAdopterQuickstartPlan(reordered, input)).toThrow(
      /quickstart\[0\]\.id/u,
    );
    expect(() =>
      assertFreshAdopterQuickstartPlan(commands.slice(0, -1), input),
    ).toThrow(/command count/u);

    const sourceVerify = commands.map((command) =>
      command.id === "no-argument-verify"
        ? ({ ...command, scope: "source-checkout" } as const)
        : command,
    );
    expect(() => assertFreshAdopterQuickstartPlan(sourceVerify, input)).toThrow(
      /scope|source no-argument/u,
    );

    const ledger = commands.map((command, index) => ({
      order: index + 1,
      id: command.id,
      scope: command.scope,
      argv: command.displayArgv,
      status: "PASS" as const,
      exitCode: 0 as const,
      durationMs: index + 1,
    }));
    const wrongOrder: FreshAdopterCommandLedgerEntry[] = ledger.map(
      (entry, index) => ({ ...entry, order: index === 0 ? 2 : entry.order }),
    );
    expect(() => assertFreshAdopterCommandLedger(wrongOrder, commands)).toThrow(
      /ledger 0\.order/u,
    );
    expect(() =>
      assertFreshAdopterCommandLedger(ledger.slice(0, -1), commands),
    ).toThrow(/ledger count/u);

    const unallowlisted: FreshAdopterQuickstartCommand[] = [
      ...commands,
      {
        id: "no-argument-verify",
        scope: "source-checkout",
        argv: ["pnpm", "verify"],
        displayArgv: ["pnpm", "verify"],
      },
    ];
    expect(() =>
      assertFreshAdopterQuickstartPlan(unallowlisted, input),
    ).toThrow(/command count|source no-argument/u);
  });

  it("requires a clean three-commit bootstrap repository with deterministic identity", () => {
    const observation = repositoryObservation();
    const expected = {
      branch: "main",
      userName: "Fixture Maintainer",
      userEmail: "maintainer@example.invalid",
      commitTimestamp: "2026-08-15T19:02:00.000Z",
    };
    expect(() =>
      assertGeneratedRepositoryObservation(observation, expected),
    ).not.toThrow();
    expect(() =>
      assertGeneratedRepositoryObservation(
        { ...observation, commitCount: 2 },
        expected,
      ),
    ).toThrow(/commit count/u);
    expect(() =>
      assertGeneratedRepositoryObservation(
        { ...observation, status: "?? unexpected.txt" },
        expected,
      ),
    ).toThrow(/Git status/u);
    expect(() =>
      assertGeneratedRepositoryObservation(
        { ...observation, readinessMarkerHistory: true },
        expected,
      ),
    ).toThrow(/marker history/u);
  });

  it("resolves the pinned source-cwd store and binds it to the offline child install", async () => {
    const sourceRoot = join(tmpdir(), "source-repository");
    const storePath = join(tmpdir(), "source-pnpm-store", "v11");
    const invocations: unknown[] = [];
    const resolved = await resolveSourcePnpmStorePath(
      sourceRoot,
      async (invocation) => {
        invocations.push(invocation);
        return { stdout: `${storePath}\n` };
      },
    );
    expect(resolved).toBe(storePath);
    expect(invocations).toEqual([
      {
        id: "pnpm-store-path",
        args: ["store", "path"],
        cwd: sourceRoot,
      },
    ]);
    expect(generatedOfflineInstallArguments(resolved)).toEqual([
      "install",
      "--offline",
      "--frozen-lockfile",
      "--package-import-method=copy",
      "--store-dir",
      storePath,
    ]);
  });

  it("fails closed for unavailable or ambiguous source-store identity", async () => {
    const sourceRoot = join(tmpdir(), "source-repository");
    const first = join(tmpdir(), "first-store", "v11");
    const second = join(tmpdir(), "second-store", "v11");
    expect(parsePnpmStorePath(`${first}\n`)).toBe(first);
    for (const output of ["", "relative/store\n", `${first}\n${second}\n`])
      expect(() => parsePnpmStorePath(output)).toThrow(/pnpm store path/u);
    expect(() => generatedOfflineInstallArguments("relative/store")).toThrow(
      /pnpm store path/u,
    );
    await expect(
      resolveSourcePnpmStorePath(sourceRoot, async () => {
        throw new Error("store command failed");
      }),
    ).rejects.toThrow(/store command failed/u);
  });
});
