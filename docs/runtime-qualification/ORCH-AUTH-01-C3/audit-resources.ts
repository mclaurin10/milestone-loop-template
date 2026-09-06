import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  evidenceContext,
  writeReceipt,
  writeManualEvidenceFailure,
} from "../../../tools/evidence.mjs";
import { inventoryContainerArtifacts } from "../../../tools/milestone-orchestrator/src/container-artifacts.js";
import { validateCommandReceiptDirectory } from "../../../tools/milestone-orchestrator/src/verifier.js";

const [inputArg, outputArg] = process.argv.slice(2);
assert(inputArg && outputArg && process.argv.length === 4);
assert.equal(process.version, "v24.18.0");
const input = resolve(inputArg),
  output = resolve(outputArg);
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = output;
const context = await evidenceContext(
  "orch-auth-c3-resource-audit",
  "actual-kernel-fault-probes",
);
const text = (file: string) => readFile(resolve(input, file), "utf8");
const fields = (value: string) =>
  Object.fromEntries(
    value
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/)),
  );
try {
  const inventory = await inventoryContainerArtifacts(input, {
    maximumFiles: 100,
    maximumBytes: 4 * 1024 * 1024,
  });
  const raw = JSON.parse(await text("result.json"));
  assert.equal(raw.status, "OBSERVED_REQUIRES_INDEPENDENT_AUDIT");
  assert.equal(raw.mechanismFaultLimitsOnly, true);
  assert.equal(raw.hostAdmission, false);
  assert.equal(raw.completionEligible, false);
  assert.equal(raw.packageStatusBefore, raw.packageStatusAfter);
  assert.match(raw.packageStatusBefore, /^[a-f0-9]{64}$/);
  const modes = ["memory", "pids", "cpu", "file", "network-mount", "deadline"];
  assert.deepEqual(
    raw.results.map((item: any) => item.mode),
    modes,
  );
  const units = new Set<string>();
  for (const item of raw.results) {
    assert(!units.has(item.unit));
    units.add(item.unit);
    assert.match(item.unit, /^orch-c3-probe-[a-f0-9-]{36}\.service$/);
    assert.equal(item.cgroupAbsent, true);
    const execution = JSON.parse(await text(`${item.mode}.json`));
    assert.deepEqual(execution, {
      mode: item.mode,
      unit: item.unit,
      argv: item.argv,
      exitCode: item.exitCode,
      durationMs: item.durationMs,
    });
    assert.deepEqual(
      JSON.parse(await text(`${item.mode}.stdout`)),
      item.observed,
    );
    assert.equal(item.observed.uid, 65534);
    assert.equal(
      item.observed.cgroup,
      "/sys/fs/cgroup/system.slice/" + item.unit,
    );
    assert.deepEqual(item.argv.slice(0, 6), [
      "/usr/bin/systemd-run",
      "--unit=" + item.unit,
      "--collect",
      "--wait",
      "--pipe",
      "--quiet",
    ]);
    for (const property of [
      "User=65534",
      "MemoryMax=64M",
      "MemorySwapMax=0",
      "CPUQuota=10%",
      "TasksMax=16",
      "LimitFSIZE=1M",
      "KillMode=control-group",
      "PrivateNetwork=yes",
      "RestrictAddressFamilies=AF_UNIX",
    ])
      assert(item.argv.includes(property), property);
    const after = await text(`${item.mode}.unit-after`);
    assert.match(after, /^MainPID=0$/m);
    assert.match(after, /^LoadState=not-found$/m);
    assert.match(after, /^ActiveState=inactive$/m);
    if (item.mode !== "deadline") {
      assert.equal(item.exitCode, 0);
      assert.equal(item.observed.status, "OBSERVED_EXPECTED_KERNEL_BOUNDARY");
    }
    switch (item.mode) {
      case "memory":
        assert.equal(item.observed.childStatus, 9);
        assert(Number(fields(item.observed.events).oom_kill) >= 1);
        assert(item.argv.includes("OOMPolicy=continue"));
        break;
      case "pids":
        assert.equal(item.observed.errno, 11);
        assert(
          item.observed.children.length > 0 &&
            item.observed.children.length < 16,
        );
        assert(Number(fields(item.observed.events).max) >= 1);
        break;
      case "cpu":
        assert(
          Number(fields(item.observed.after).nr_throttled) >
            Number(fields(item.observed.before).nr_throttled),
        );
        assert(
          Number(fields(item.observed.after).throttled_usec) >
            Number(fields(item.observed.before).throttled_usec),
        );
        break;
      case "file":
        assert.equal(item.observed.errno, 27);
        assert.equal(item.observed.bytes, 1048576);
        assert.match(
          item.observed.limits,
          /^Max file size\s+1048576\s+1048576\s+bytes[ \t]*$/m,
        );
        break;
      case "network-mount":
        assert.deepEqual(item.observed.interfaces, ["lo"]);
        assert.equal(item.observed.failures.writeReadonly, 30);
        assert([1, 97].includes(item.observed.failures.networkFamily));
        assert.equal(item.observed.failures.maskedDaemon, 13);
        break;
      case "deadline":
        assert.notEqual(item.exitCode, 0);
        assert(item.argv.includes("RuntimeMaxSec=2"));
        assert.equal(item.observed.reached, true);
        assert(item.durationMs >= 1500 && item.durationMs < 10000);
        break;
    }
  }
  const checks = [
    {
      id: "SIX-KERNEL-BOUNDARIES",
      summary:
        "Six task-owned native service probes reached actual memory, process, CPU, file, namespace/network and deadline boundaries, then their whole cgroups disappeared.",
    },
  ];
  await writeFile(
    resolve(output, "resource-audit.json"),
    JSON.stringify(
      {
        status: "PASS",
        mechanismFaultLimitsOnly: true,
        hostAdmission: false,
        completionEligible: false,
        inventory,
        modes,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  await writeReceipt(context, checks, [
    { path: "resource-audit.json", kind: "orch-auth-c3-resource-audit" },
  ]);
  await validateCommandReceiptDirectory({
    directory: output,
    expectedStageId: context.stageId,
    expectedCommandId: context.commandId,
    requiredKinds: ["orch-auth-c3-resource-audit"],
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      probes: 6,
      completionEligible: false,
      receipt: resolve(output, "result.json"),
    }),
  );
} catch (error) {
  await writeManualEvidenceFailure(context, {
    kind: "product",
    message: String(error),
  });
  throw error;
}
