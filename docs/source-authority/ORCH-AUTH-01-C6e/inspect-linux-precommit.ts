import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Pin = { path: string; bytes: number; sha256: string };
type Source = { commit: string; tree: string; branch: string; status: string };
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Reinspect retained kernel, supervisor and Git observations; never launch jobs. */
export async function inspectLinuxPrecommit(args: {
  directory: string;
  source: Source;
  pins: Pin[];
}) {
  const read = async (path: string) =>
    JSON.parse(await readFile(resolve(args.directory, path), "utf8"));
  const prepared = await read("preparation.json");
  assert.equal(prepared.schemaVersion, "c6e-owned-linux-input.v1");
  assert.deepEqual(prepared.source, args.source);
  assert.equal(args.source.branch, "refs/heads/master");
  assert.equal(args.source.status, "");
  assert.equal(args.pins.length, 331);
  assert.deepEqual(prepared.pins, args.pins);
  assert.match(
    prepared.root,
    /^\/home\/duncan\/c6e-linux-precommit-[a-z0-9_]+$/,
  );
  assert.equal(prepared.environment.HOME, prepared.root + "/account");
  const worker = await readFile(resolve(args.directory, "executed-worker.py"));
  assert.equal(hash(worker), prepared.worker.sha256);
  assert.equal(worker.length, prepared.worker.bytes);
  const boundaries = [];
  for (const mode of ["probe", "verify"]) {
    const launch = await read(mode + "-launch/execution.json");
    const observed = await read(
      mode === "probe" ? "probe-namespace.json" : "verify/namespace.json",
    );
    assert.equal(launch.exitCode, 0);
    assert.equal(launch.cgroupAbsent, true);
    assert.equal(launch.qualificationClaim, false);
    assert.equal(launch.completionEligible, false);
    assert.deepEqual(launch.source, args.source);
    assert.match(launch.unit, /^orch-c6e-source-[a-f0-9-]{36}\.service$/);
    assert.match(launch.unitAfter.stdout, /^MainPID=0$/m);
    assert.match(launch.unitAfter.stdout, /^ActiveState=inactive$/m);
    assert.match(launch.unitAfter.stdout, /^ControlGroup=$/m);
    for (const property of [
      "User=1000",
      "Group=1000",
      "SupplementaryGroups=",
      "MemoryMax=8G",
      "MemorySwapMax=0",
      "CPUQuota=400%",
      "TasksMax=1024",
      "RuntimeMaxSec=28800",
      "TimeoutStopSec=10",
      "KillMode=control-group",
      "LimitFSIZE=2147483648",
      "LimitCORE=0",
      "NoNewPrivileges=yes",
      "CapabilityBoundingSet=",
      "PrivateNetwork=yes",
      "PrivateMounts=yes",
      "PrivateTmp=yes",
      "PrivateDevices=yes",
      "ProtectSystem=strict",
      "ProtectHome=tmpfs",
      "ProtectControlGroups=yes",
      "RestrictSUIDSGID=yes",
      "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK",
      "InaccessiblePaths=/mnt /root -/run/docker.sock -/var/run/docker.sock -/run/containerd -/var/lib/docker",
      `BindPaths=${prepared.root}/account:/home/duncan ${prepared.root} ${prepared.dependencyRoot}/store ${prepared.dependencyRoot}/cache`,
      `BindReadOnlyPaths=${prepared.dependencyRoot}/bin ${prepared.dependencyRoot}/pnpm /home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64`,
      `ReadWritePaths=/home/duncan ${prepared.root} ${prepared.dependencyRoot}/store ${prepared.dependencyRoot}/cache`,
    ])
      assert(launch.properties.includes(property), property);
    assert.equal(
      observed.schemaVersion,
      "source-check-namespace-observation.v1",
    );
    assert.equal(observed.uid, 1000);
    assert.equal(observed.gid, 1000);
    assert.deepEqual(observed.source, args.source);
    assert.equal(observed.platform, "linux");
    assert.deepEqual(observed.interfaces, ["lo"]);
    assert.equal(observed.loopbackConnectionPassed, true);
    for (const kind of ["mnt", "net"])
      assert.notEqual(
        observed.namespaceIds[kind],
        launch.parentNamespaces[kind],
      );
    for (const [key, value] of [
      ["NoNewPrivs", "1"],
      ["CapEff", "0000000000000000"],
      ["CapPrm", "0000000000000000"],
    ])
      assert.match(
        observed.status,
        new RegExp("^" + key + ":\\s+" + value + "$", "m"),
      );
    assert.deepEqual(
      observed.dockerSocketDenials.map((row: { path: string }) => row.path),
      ["/run/docker.sock", "/var/run/docker.sock"],
    );
    assert(
      observed.dockerSocketDenials.every((row: { errno: number }) =>
        [2, 13, 88].includes(row.errno),
      ),
    );
    assert.deepEqual(observed.resources, {
      "memory.max": "8589934592\n",
      "memory.swap.max": "0\n",
      "cpu.max": "400000 100000\n",
      "pids.max": "1024\n",
    });
    assert.equal(observed.cgroup, "0::/system.slice/" + launch.unit + "\n");
    for (const key of [
      "actualDockerExecution",
      "sourceQualification",
      "completionEligible",
    ])
      assert.equal(observed[key], false);
    boundaries.push({
      mode,
      unit: launch.unit,
      durationMs: launch.durationMs,
      namespaces: observed.namespaceIds,
      ownedCgroupAbsent: true,
    });
  }
  assert.notEqual(boundaries[0]!.unit, boundaries[1]!.unit);
  const collected = await read("collection.json");
  assert.equal(collected.schemaVersion, "owned-source-check-collection.v1");
  assert.deepEqual(collected.source, args.source);
  assert.equal(collected.executionExitCode, 0);
  assert.equal(collected.root, prepared.root);
  assert.equal(collected.pinsUnchanged, true);
  assert.deepEqual(collected.pins, args.pins);
  assert.equal(collected.sourceStateAbsent, true);
  assert.equal(collected.verificationClaim, false);
  assert.equal(collected.completionEligible, false);
  const gitChecks = [
    { argv: ["rev-parse", "HEAD"], stdout: args.source.commit + "\n" },
    { argv: ["rev-parse", "HEAD^{tree}"], stdout: args.source.tree + "\n" },
    {
      argv: ["symbolic-ref", "--quiet", "HEAD"],
      stdout: args.source.branch + "\n",
    },
    { argv: ["status", "--porcelain"], stdout: "" },
    {
      argv: ["for-each-ref", "--format=%(refname)", "refs/milestone-loop/"],
      stdout: "",
    },
  ];
  assert.equal(collected.gitAfter.length, gitChecks.length);
  for (let index = 0; index < gitChecks.length; index++) {
    assert.deepEqual(collected.gitAfter[index], {
      argv: [
        "git",
        "--no-optional-locks",
        "-C",
        prepared.root + "/source",
        ...gitChecks[index]!.argv,
      ],
      exitCode: 0,
      stdout: gitChecks[index]!.stdout,
      stderr: "",
    });
  }
  const observed = await read("verify/observation.json");
  assert.equal(observed.schemaVersion, "clean-source-precommit-observation.v2");
  assert.equal(observed.status, "COMPLETED_REQUIRES_INDEPENDENT_AUDIT");
  assert.deepEqual(observed.source, args.source);
  assert.deepEqual(observed.pins, args.pins);
  assert.equal(observed.platform, "linux");
  assert.equal(observed.privateReferencesAbsent, true);
  for (const key of [
    "sourceStateAdopted",
    "actualImplementationAudit",
    "actualCandidate",
    "actualDockerExecution",
    "completionEligible",
  ])
    assert.equal(observed[key], false);
  const commands = [
    ["typecheck", "typecheck"],
    ["lint", "lint"],
    ["format", "format:check"],
    ["architecture", "lint:source-architecture"],
    ["dependencies", "verify:source-dependencies"],
    ["invariants", "test:invariants"],
    ["orchestrator", "test:orchestrator"],
    ["unit", "test:unit"],
    ["build", "build"],
  ];
  assert.equal(observed.commands.length, commands.length);
  assert.deepEqual(
    await read("verify/completed-commands.json"),
    observed.commands,
  );
  let previousFinished = 0n;
  const executions = [];
  for (const [index, [name, command]] of [
    ["install", "install"],
    ...commands,
  ].entries()) {
    const raw = await read("verify/" + name + ".execution.json");
    assert.equal(raw.name, name);
    assert.deepEqual(raw.argv, [
      prepared.dependencyRoot + "/bin/pnpm",
      "--config.verify-deps-before-run=error",
      command,
      ...(index === 0
        ? ["--frozen-lockfile", "--offline", "--package-import-method=copy"]
        : []),
    ]);
    assert.equal(raw.cwd, prepared.root + "/source");
    assert.equal(raw.uid, 1000);
    assert.equal(raw.exitCode, 0);
    assert.equal(raw.timedOut, false);
    assert.equal(raw.outputLimitExceeded, false);
    assert.equal(raw.outerTimeoutMs, index === 0 ? 1_200_000 : 5_520_000);
    assert(raw.durationMs > 0 && raw.durationMs < raw.outerTimeoutMs);
    const start = BigInt(raw.startedEpochNanoseconds);
    const finish = BigInt(raw.finishedEpochNanoseconds);
    assert(start >= previousFinished && finish > start);
    assert(Math.abs(Number(finish - start) / 1e6 - raw.durationMs) < 1000);
    previousFinished = finish;
    const streams = [];
    for (const stream of ["stdout", "stderr"]) {
      const bytes = await readFile(
        resolve(args.directory, "verify/" + name + "." + stream + ".log"),
      );
      assert(bytes.length <= 67_108_864);
      streams.push({ stream, bytes: bytes.length, sha256: hash(bytes) });
    }
    if (index > 0) assert.deepEqual(observed.commands[index - 1], raw);
    executions.push({ ...raw, streams });
  }
  return {
    schemaVersion: "retained-linux-source-checks.v1",
    source: args.source,
    platform: "linux",
    boundaries,
    executions,
    pins: args.pins.length,
    cleanAttachedGitAfter: true,
    qualification: false,
    completionEligible: false,
  };
}
