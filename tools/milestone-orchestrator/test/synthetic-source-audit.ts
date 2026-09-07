import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SOURCE_AUDIT_COMMANDS,
  SOURCE_AUDIT_PREFIX,
  sourceHash,
} from "../src/source-authority-evidence.mjs";
import { CONTRACT_INTEGRITY_CHECK_IDS } from "../src/contract-integrity.js";
import {
  beginTestRunMeasurement,
  describeVitestReport,
} from "../src/test-run-summary.js";
import { inspectSourceArchitecture } from "../../source-release-inspection.mjs";
import { createCommittedReleasePayload } from "../../source-release-command.mjs";
import { LEGACY_DEPENDENCY_INSPECTOR_SHA256 } from "../src/source-authority-audit-reports.mjs";

// Test-only inputs. Actual Git/archive bytes and architecture inspection are
// combined with explicitly synthetic command/test/consumer observations. This
// never runs or claims an implementation audit, service review or candidate.
export type SyntheticAuditFile = {
  path: string;
  kind: string;
  contents: Buffer;
};
type ReceiptWriter = (
  root: string,
  prefix: string,
  stageId: string,
  commandId: string,
  files: SyntheticAuditFile[],
) => Promise<Buffer>;
const bytes = (value: unknown) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n");
const file = (
  path: string,
  kind: string,
  value: unknown,
): SyntheticAuditFile => ({ path, kind, contents: bytes(value) });
const runtime = {
  nodeVersion: "v24.18.0",
  pnpmVersion: "11.15.1",
  platform: process.platform,
  architecture: process.arch,
};
const syntheticLog = Buffer.from(
  "Synthetic prerequisite fixture; no command execution is claimed.\n",
);
const rawKind = "source-authority-audit-raw-evidence";
function supervision(stdout: Buffer, stderr = Buffer.alloc(0)) {
  const stream = (contents: Buffer) => ({
    bytesCaptured: contents.length,
    totalBytesObserved: contents.length,
    truncated: false,
    capBytes: 64 * 1024 * 1024,
  });
  return {
    timedOut: false,
    outputLimitExceeded: false,
    terminationReason: null,
    termination: null,
    streamsClosed: true,
    drainTimedOut: false,
    drainCutoff: null,
    drainSweep: null,
    stdout: stream(stdout),
    stderr: stream(stderr),
    duplicateSettleSignals: [],
  };
}
function rawVitest(paths: string[]) {
  return {
    success: true,
    numTotalTestSuites: paths.length,
    numPassedTestSuites: paths.length,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: paths.length,
    numPassedTests: paths.length,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    unhandledErrors: [],
    testResults: paths.map((path) => ({
      name: path,
      status: "passed",
      assertionResults: [
        {
          fullName: "Synthetic prerequisite only: " + path,
          status: "passed",
          failureMessages: [],
          duration: 0,
        },
      ],
    })),
  };
}
export async function syntheticSourceAudit(input: {
  root: string;
  implementation: { commit: string; tree: string; branch: string };
  writeReceipt: ReceiptWriter;
}) {
  const { root, implementation, writeReceipt } = input;
  const readJson = async (path: string) =>
    JSON.parse((await readFile(resolve(root, path))).toString());
  const policy = await readJson("tools/source-release-policy.json");
  const catalogPath = "tools/milestone-orchestrator/config/test-ownership.json";
  const catalogBytes = await readFile(resolve(root, catalogPath));
  const catalog = JSON.parse(catalogBytes.toString()) as {
    id: string;
    owners: { id: string; files: string[] }[];
  };
  const rootFiles = catalog.owners
    .filter((owner) => owner.id !== "trusted-container-fixture")
    .flatMap((owner) => owner.files);
  const architecture = await inspectSourceArchitecture(root);
  const source = { commit: implementation.commit, tree: implementation.tree };
  const commands = [];
  const nested: SyntheticAuditFile[] = [];
  for (const [ordinal, command] of SOURCE_AUDIT_COMMANDS.entries()) {
    const prefix = "commands/" + command.id + "/";
    const startedAt = new Date(
      Date.UTC(2026, 8, 6, 0, ordinal * 2),
    ).toISOString();
    const finishedAt = new Date(Date.parse(startedAt) + 60_000).toISOString();
    const childFiles: SyntheticAuditFile[] = [];
    const extra: SyntheticAuditFile[] = [];
    const capture = (
      id: string,
      argv: string[],
      stdout: Buffer = syntheticLog,
      cwd?: string,
    ) => {
      childFiles.push({
        path: id + ".stdout.log",
        kind: rawKind,
        contents: stdout,
      });
      return {
        id,
        argv,
        exitCode: 0,
        stdoutPath: id + ".stdout.log",
        stderrPath: id + ".stderr.log",
        ...(cwd === undefined
          ? {}
          : {
              cwd,
              stdout: { bytes: stdout.length, sha256: sourceHash(stdout) },
              stderr: { bytes: 0, sha256: sourceHash(Buffer.alloc(0)) },
            }),
      };
    };
    if (["typecheck", "lint", "format"].includes(command.id)) {
      const executed =
        command.id === "typecheck"
          ? {
              status: "PASS",
              execution: "single-process-typescript-incremental-compiler-api",
              compilerVersion: (await readJson("package.json")).devDependencies
                .typescript,
              configCount: 1,
              cachedSourceFileCount: 1,
              configs: [
                {
                  path: "tsconfig.tools.json",
                  rootFileCount: 1,
                  sourceFileCount: 1,
                },
              ],
            }
          : {
              command:
                "synthetic-node synthetic-pnpm.mjs exec " +
                (command.id === "lint"
                  ? "eslint scripts tools fixtures/oci-candidate fixtures/fresh-adopter vitest.config.ts"
                  : "prettier --check scripts tools fixtures/oci-candidate fixtures/fresh-adopter vitest.config.ts"),
              exitCode: 0,
              signal: null,
              stdout: "",
              stderr: "",
              supervision: supervision(Buffer.alloc(0)),
            };
      childFiles.push(
        file("fixture-0.json", command.requiredKinds[0]!, {
          schemaVersion: "1.0.0",
          status: "PASS",
          mode: command.id,
          identity: {
            gitCommit: source.commit,
            gitTree: source.tree,
            gitStatus: "",
            nodeVersion: runtime.nodeVersion,
            pnpmVersion: runtime.pnpmVersion,
          },
          commands: [executed],
        }),
      );
    } else if (command.id === "architecture") {
      childFiles.push(
        file("architecture.json", "source-architecture-report", architecture),
      );
    } else if (command.id === "dependencies") {
      const store = "/synthetic-prerequisite/store/v11";
      const legacy =
        sourceHash(
          await readFile(resolve(root, "tools/source-release-inspection.mjs")),
        ) === LEGACY_DEPENDENCY_INSPECTOR_SHA256;
      const references = {
        actual: "/synthetic-actual",
        pristine: "/synthetic/source-dependency-reference-fixture/pristine",
        built: legacy
          ? "/synthetic-reference"
          : "/synthetic/source-dependency-reference-fixture/built",
      };
      const graphArgv = [
        "pnpm",
        "list",
        "--recursive",
        "--depth",
        "Infinity",
        "--json",
      ];
      const packages = new Map<
        string,
        {
          path: string;
          name: string;
          version: string;
          present: boolean;
          fileCount: number;
          totalBytes: number;
          inventorySha256: string;
        }
      >();
      const manifests = await Promise.all(
        architecture.packageGraph.packages.map(async (pkg) => ({
          pkg,
          manifest: await readJson(pkg.manifestPath),
        })),
      );
      const observedGraph = (prefix: string) =>
        manifests.map(({ pkg, manifest }) => {
          const dependencies = Object.fromEntries(
            ["dependencies", "devDependencies", "optionalDependencies"]
              .filter((kind) => manifest[kind])
              .map((kind) => [
                kind,
                Object.fromEntries(
                  Object.entries(manifest[kind]).map(([name, version]) => {
                    const workspace = architecture.packageGraph.packages.find(
                      (pkg) => pkg.name === name,
                    );
                    const path =
                      workspace?.root ??
                      "node_modules/.pnpm/synthetic-" +
                        encodeURIComponent(name) +
                        "/node_modules/" +
                        name;
                    if (!workspace)
                      packages.set(path, {
                        path,
                        name,
                        version: String(version),
                        present: true,
                        fileCount: 1,
                        totalBytes: syntheticLog.length,
                        inventorySha256: sourceHash(syntheticLog),
                      });
                    return [
                      name,
                      {
                        from: name,
                        version: workspace
                          ? "link:synthetic-workspace"
                          : String(version),
                        path: prefix + "/" + path,
                      },
                    ];
                  }),
                ),
              ]),
          );
          return {
            name: pkg.name,
            version: manifest.version,
            private: manifest.private === true,
            path: prefix + (pkg.root === "." ? "" : "/" + pkg.root),
            ...dependencies,
          };
        });
      const captures = [
        capture(
          "exact-pnpm",
          ["pnpm", "--version"],
          Buffer.from("11.15.1\n"),
          legacy ? undefined : references.actual,
        ),
        capture(
          "store-path",
          ["pnpm", "store", "path"],
          Buffer.from(store + "\n"),
          legacy ? undefined : references.actual,
        ),
        ...(legacy
          ? [capture("store-integrity", ["pnpm", "store", "status"])]
          : []),
        capture(
          "installed-graph",
          graphArgv,
          bytes(observedGraph("/synthetic-actual")),
          legacy ? undefined : references.actual,
        ),
        ...(legacy
          ? []
          : [
              capture(
                "pristine-install",
                [
                  "pnpm",
                  "install",
                  "--frozen-lockfile",
                  "--offline",
                  "--ignore-scripts",
                  "--side-effects-cache=false",
                  "--package-import-method=copy",
                  "--store-dir",
                  store,
                ],
                syntheticLog,
                references.pristine,
              ),
              capture(
                "store-integrity",
                ["pnpm", "store", "status"],
                syntheticLog,
                references.pristine,
              ),
            ]),
        capture(
          "reference-install",
          [
            "pnpm",
            "install",
            "--frozen-lockfile",
            "--offline",
            "--package-import-method=copy",
            "--store-dir",
            store,
          ],
          syntheticLog,
          legacy ? undefined : references.built,
        ),
        capture(
          "reference-graph",
          graphArgv,
          bytes(observedGraph(references.built)),
          legacy ? undefined : references.built,
        ),
      ];
      childFiles.push(
        file("dependencies.json", "source-dependencies-report", {
          schemaVersion: legacy
            ? "source-dependencies-report.v1"
            : "source-dependencies-report.v2",
          status: "PASS",
          claimScope: "source-supporting-check",
          completionEligible: false,
          nodeVersion: runtime.nodeVersion,
          pnpmVersion: runtime.pnpmVersion,
          packageGraph: architecture.packageGraph,
          lockSha256: sourceHash(
            await readFile(resolve(root, "pnpm-lock.yaml")),
          ),
          store,
          independentReference: {
            isolated: true,
            frozen: true,
            offline: true,
            importMethod: "copy",
          },
          ...(legacy ? {} : { references }),
          packages: [...packages.values()],
          captures,
        }),
      );
    } else if (command.id === "unit") {
      const raw = file(
        "vitest-report.json",
        "vitest-report",
        rawVitest(rootFiles),
      );
      childFiles.push(raw);
      // Use the production measurement encoder on clearly synthetic raw input;
      // the fixture's clock and lack of instrumented children remain explicit.
      await writeReceipt(
        root,
        SOURCE_AUDIT_PREFIX + prefix,
        command.stageId,
        command.commandId,
        [raw],
      );
      let tick = 0n,
        clock = 0;
      const session = await beginTestRunMeasurement({
        artifactDirectory: resolve(root, SOURCE_AUDIT_PREFIX + prefix),
        runId: "synthetic-source-audit-unit",
        stageId: command.stageId,
        commandId: command.commandId,
        role: "legacy",
        owner: null,
        identity: {
          gitCommit: source.commit,
          gitTree: source.tree,
          workingTreeDirty: false,
          nodeVersion: runtime.nodeVersion,
          pnpmVersion: runtime.pnpmVersion,
        },
        now: () => new Date(Date.parse(startedAt) + 1000 + clock++ * 1000),
        hrtime: () => ++tick,
      });
      session.markSetupFinished();
      const summary = await session.finish([
        await describeVitestReport({
          artifactDirectory: resolve(root, SOURCE_AUDIT_PREFIX + prefix),
          reportPath: resolve(root, SOURCE_AUDIT_PREFIX + prefix + raw.path),
        }),
      ]);
      childFiles.push({
        path: "test-run-summary.json",
        kind: "test-run-summary",
        contents: await readFile(summary.path),
      });
    } else if (command.id === "invariants") {
      const registryPath =
        "tools/milestone-orchestrator/config/invariant-suite.json";
      const registryBytes = await readFile(resolve(root, registryPath));
      const registry = JSON.parse(registryBytes.toString()) as {
        id: string;
        entries: {
          id: string;
          argv: string[];
          expectedArtifactKinds: string[];
        }[];
      };
      const entries = [];
      for (const [index, entry] of registry.entries.entries()) {
        const nestedPrefix = "entries/" + entry.id + "/";
        const report =
          entry.id === "protected-integrity"
            ? {
                schemaVersion: "contract-integrity-report.v1",
                status: "PASS",
                completionEligible: false,
                checkIdentityValid: true,
                expectedCheckIds: [...CONTRACT_INTEGRITY_CHECK_IDS],
                counts: { total: 13, pass: 13, fail: 0, notReady: 0 },
                checks: CONTRACT_INTEGRITY_CHECK_IDS.map((id) => ({
                  id,
                  status: "PASS",
                  message: "Synthetic prerequisite observation only.",
                })),
              }
            : entry.id === "test-ownership"
              ? {
                  schemaVersion: "1.0.0",
                  status: "PASS",
                  diagnostics: [],
                  catalogue: {
                    id: catalog.id,
                    path: catalogPath,
                    bytes: catalogBytes.length,
                    sha256: sourceHash(catalogBytes),
                  },
                  owners: catalog.owners.map((owner) => ({
                    ...owner,
                    count: owner.files.length,
                  })),
                  discovery: {
                    uniqueFileCount: catalog.owners.reduce(
                      (total, owner) => total + owner.files.length,
                      0,
                    ),
                    sources: [
                      {
                        configPath: "vitest.config.ts",
                        filters: [],
                        repeatCount: 2,
                        files: [...rootFiles].sort(),
                      },
                    ],
                  },
                }
              : rawVitest(entry.argv.filter((arg) => arg.endsWith(".test.ts")));
        const files = [
          file("report.json", entry.expectedArtifactKinds[0]!, report),
        ];
        const receipt = await writeReceipt(
          root,
          SOURCE_AUDIT_PREFIX + prefix + nestedPrefix,
          "invariant-suite",
          entry.id,
          files,
        );
        extra.push(
          {
            path: nestedPrefix + "result.json",
            kind: rawKind,
            contents: receipt,
          },
          ...files.map((f) => ({ ...f, path: nestedPrefix + f.path })),
        );
        entries.push({
          id: entry.id,
          argv: entry.argv,
          status: "PASS",
          exitCode: 0,
          signal: null,
          startedAt: new Date(
            Date.parse(startedAt) + index * 2000,
          ).toISOString(),
          finishedAt: new Date(
            Date.parse(startedAt) + index * 2000 + 1000,
          ).toISOString(),
          receiptAbsenceReason: null,
          receipt: {
            receiptSha256: sourceHash(receipt),
            receiptBytes: receipt.length,
            artifactCount: files.length,
            artifactBytes: files.reduce((n, f) => n + f.contents.length, 0),
            kinds: [...entry.expectedArtifactKinds].sort(),
            artifacts: files.map((f) => ({
              path: resolve(
                root,
                SOURCE_AUDIT_PREFIX + prefix + nestedPrefix + f.path,
              ),
              kind: f.kind,
              bytes: f.contents.length,
              sha256: sourceHash(f.contents),
            })),
          },
        });
      }
      childFiles.push(
        file("invariant-suite-report.json", "invariant-suite-report", {
          schemaVersion: "1.1.0",
          status: "PASS",
          completionEligible: false,
          completionIneligibilityReason: "incremental-invariant-suite",
          serial: true,
          registry: {
            id: registry.id,
            path: registryPath,
            bytes: registryBytes.length,
            sha256: sourceHash(registryBytes),
          },
          startedAt,
          finishedAt,
          commands: entries,
        }),
      );
    } else if (command.id === "build") {
      const built = await createCommittedReleasePayload(root, source, policy);
      const store = "/synthetic-prerequisite/store/v11";
      const generated = {
        commit: "a".repeat(40),
        tree: "b".repeat(40),
        branch: "main",
        commitCount: 2,
        packageName: "synthetic-prerequisite-only",
        defaultProfile: "bootstrap",
        sourceContractAbsent: true,
        controllerStateAbsent: true,
      };
      const captures = [
        { id: "store-path", argv: ["pnpm", "store", "path"] },
        {
          id: "consumer-install",
          argv: [
            "pnpm",
            "install",
            "--frozen-lockfile",
            "--offline",
            "--package-import-method=copy",
            "--store-dir",
            store,
          ],
        },
        {
          id: "consumer-generate",
          argv: [
            "pnpm",
            "exec",
            "tsx",
            "tools/milestone-orchestrator/src/adopter-package-cli.ts",
            "--definition",
            "fixtures/fresh-adopter/definition.json",
            "--output",
            "/synthetic-prerequisite/generated",
          ],
        },
      ].map((capture) => ({
        ...capture,
        exitCode: 0,
        stdoutPath: capture.id + ".stdout.log",
        stderrPath: capture.id + ".stderr.log",
      }));
      const consumer = {
        schemaVersion: "source-release-consumer.v1",
        status: "PASS",
        source,
        releaseArchiveSha256: sourceHash(built.archive),
        claimScope: "bounded-external-generator-smoke",
        completionEligible: false,
        completeBuildQualification: false,
        completeAdopterQualification: false,
        originalCheckoutInaccessible: false,
        nodeVersion: runtime.nodeVersion,
        pnpmVersion: runtime.pnpmVersion,
        generated,
        captures,
      };
      const produced = {
        schemaVersion: "source-release-build.v1",
        status: "PASS",
        claimScope: "source-supporting-build",
        completionEligible: false,
        source,
        archive: built.manifest.archive,
        payload: built.manifest.payload,
        consumer,
      };
      const nestedPrefix = "source-release/build-evidence/";
      const generatedRaw = {
        schemaVersion: "milestone-loop-adopter-package-result.v1",
        status: "PASS",
        git: {
          clean: true,
          commitCount: 2,
          commissioningInputCommit: generated.commit,
          tree: generated.tree,
        },
        project: { profile: "bootstrap", packageName: generated.packageName },
        generated: {
          activeManifestPresent: false,
          readinessMarkerPresent: false,
        },
      };
      const producedFiles = [
        file("report.json", "source-release-build-report", produced),
        file("architecture.json", rawKind, architecture),
        {
          path: "store-path.stdout.log",
          kind: rawKind,
          contents: Buffer.from(store + "\n"),
        },
        {
          path: "consumer-install.stdout.log",
          kind: rawKind,
          contents: syntheticLog,
        },
        file("consumer-generate.stdout.log", rawKind, generatedRaw),
      ];
      const receipt = await writeReceipt(
        root,
        SOURCE_AUDIT_PREFIX + prefix + nestedPrefix,
        "source-release-build",
        "build:production",
        producedFiles,
      );
      childFiles.push(
        {
          path: nestedPrefix + "result.json",
          kind: rawKind,
          contents: receipt,
        },
        ...producedFiles.map((f) => ({
          ...f,
          path: nestedPrefix + f.path,
          kind: rawKind,
        })),
      );
      const execution = (
        argv: string[],
        offset: number,
        stdout = syntheticLog.toString(),
      ) => ({
        argv,
        startedAt: new Date(Date.parse(startedAt) + offset).toISOString(),
        finishedAt: new Date(
          Date.parse(startedAt) + offset + 1000,
        ).toISOString(),
        exitCode: 0,
        signal: null,
        error: null,
        stdout,
        stderr: "",
      });
      const dependencyStore = {
        path: store,
        command: execution(["pnpm", "store", "path"], 0, store + "\n"),
      };
      const preparation = execution(
        [
          "pnpm",
          "install",
          "--frozen-lockfile",
          "--offline",
          "--package-import-method=copy",
          "--store-dir",
          store,
        ],
        2000,
      );
      const buildCommand = execution(["pnpm", "run", "build:production"], 4000);
      childFiles.push(
        file("build-report.json", "build-report", {
          schemaVersion: "1.0.0",
          status: "PASS",
          mode: "build",
          source,
          runtime: {
            nodeVersion: runtime.nodeVersion,
            pnpmVersion: runtime.pnpmVersion,
          },
          productionBuild: {
            script: "build:production",
            outputRoots: ["dist"],
          },
          dependencyStore,
          preparation,
          command: buildCommand,
          commands: [dependencyStore.command, preparation, buildCommand],
        }),
        file(
          "source-release/release-manifest.json",
          "source-release-manifest",
          built.manifest,
        ),
        {
          path: "source-release/release.tar.gz",
          kind: "source-release-archive",
          contents: built.archive,
        },
        file(
          "source-release/consumer.json",
          "source-release-consumer",
          consumer,
        ),
      );
      const outputFiles = new Map<string, Buffer>(
        built.files.map((file: { path: string; contents: Buffer }) => [
          "dist/payload/" + file.path,
          file.contents,
        ]),
      );
      for (const file of childFiles)
        if (file.path.startsWith("source-release/"))
          outputFiles.set(
            "dist/" + file.path.slice("source-release/".length),
            file.contents,
          );
      for (const capture of captures)
        for (const path of [capture.stdoutPath, capture.stderrPath])
          if (!outputFiles.has("dist/build-evidence/" + path))
            outputFiles.set("dist/build-evidence/" + path, Buffer.alloc(0));
      const buildReport = childFiles.find(
        (file) => file.kind === "build-report",
      )!;
      const value = JSON.parse(buildReport.contents.toString());
      value.outputs = {
        fileCount: outputFiles.size,
        totalBytes: [...outputFiles.values()].reduce(
          (sum, contents) => sum + contents.length,
          0,
        ),
        files: [...outputFiles].map(([path, contents]) => ({
          path,
          bytes: contents.length,
          sha256: sourceHash(contents),
        })),
      };
      buildReport.contents = bytes(value);
    } else throw new Error("Unknown synthetic audit command.");
    const receipt = await writeReceipt(
      root,
      SOURCE_AUDIT_PREFIX + prefix,
      command.stageId,
      command.commandId,
      childFiles,
    );
    nested.push(
      { path: prefix + "result.json", kind: rawKind, contents: receipt },
      ...[...childFiles, ...extra].map((f) => ({
        ...f,
        path: prefix + f.path,
        kind: rawKind,
      })),
      {
        path: prefix + "audit-child-stdout.log",
        kind: rawKind,
        contents: syntheticLog,
      },
      file(prefix + "audit-child-execution.json", rawKind, {
        schemaVersion: "source-authority-audit-execution.v1",
        implementation,
        argv: command.argv,
        timeoutMs: 90 * 60 * 1000,
        startedAt,
        finishedAt,
        exitCode: 0,
        signal: null,
        error: null,
        supervision: supervision(syntheticLog),
      }),
    );
    commands.push({
      ...command,
      exitCode: 0,
      startedAt,
      finishedAt,
      receipt: {
        path: prefix + "result.json",
        bytes: receipt.length,
        sha256: sourceHash(receipt),
      },
    });
  }
  return { commands, nested };
}
