import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// This auditor consumes observations made by a trusted, task-owned coordinator.
// Candidate data cannot select the expected binding or authenticate a host.
// A successful audit covers one recorded Linux lifecycle, never source readiness.
export const DOCKER_HOST_LIMITS = Object.freeze({
  memoryBytes: 4_294_967_296,
  guestMemoryBytes: 3_221_225_472,
  swapBytes: 0,
  cpuQuota: "200000 100000",
  processes: 64,
  fileBytes: 18_253_611_008,
  guestDiskBytes: 17_179_869_184,
  deadlineMs: 1_800_000,
  transferBytes: 67_108_864,
});
export const DOCKER_HOST_AUTHORITY =
  "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108";
export const dockerHostSha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function validateDockerHostThreadPool(observed) {
  assert.equal(
    observed,
    16,
    "QEMU I/O pool must fit inside the whole-unit task limit",
  );
}

export function validateDockerHostDisk(observed) {
  assert.equal(
    observed,
    DOCKER_HOST_LIMITS.guestDiskBytes,
    "QMP must report the finite provisioning disk capacity",
  );
}

export function validateDockerHostBinding(binding) {
  assert.equal(binding.authorityDigest, DOCKER_HOST_AUTHORITY);
  assert.equal(binding.activeAuthorityEpoch, "legacy-source.v1");
  assert.equal(binding.purpose, "candidate-support");
  assert.match(binding.runId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  for (const field of ["nonce", "inputManifestSha256"])
    assert.match(binding[field], /^[a-f0-9]{64}$/);
  for (const field of ["sourceCommit", "sourceTree"])
    assert.match(binding[field], /^[a-f0-9]{40}$/);
  assert.equal(
    binding.imageDigest,
    "sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad",
  );
}

const field = (status, name) => {
  const matches = [...status.matchAll(new RegExp(`^${name}:\\s*(.*)$`, "gm"))];
  assert.equal(matches.length, 1, `Missing or duplicate process field ${name}`);
  return matches[0][1].trim();
};

export function validateDockerHostResources(observation, mount) {
  const { pid, status, resources, limits } = observation;
  assert(Number.isSafeInteger(pid) && pid > 1);
  assert.equal(field(status, "Pid"), String(pid));
  for (const name of ["Uid", "Gid"])
    assert.deepEqual(field(status, name).split(/\s+/), Array(4).fill("65534"));
  assert.deepEqual(field(status, "Groups").split(/\s+/).sort(), [
    "65534",
    "993",
  ]);
  for (const name of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])
    assert.equal(field(status, name), "0000000000000000");
  assert.equal(field(status, "NoNewPrivs"), "1");
  assert.equal(field(status, "Seccomp"), "2");
  for (const [name, expected] of Object.entries({
    "memory.max": String(DOCKER_HOST_LIMITS.memoryBytes),
    "memory.swap.max": "0",
    "cpu.max": DOCKER_HOST_LIMITS.cpuQuota,
    "pids.max": String(DOCKER_HOST_LIMITS.processes),
  }))
    assert.equal(resources[name].trim(), expected, name);
  // The fixed WSL kernel prints an attached init-namespace KVM kthread as 0.
  // Require exactly the recorded QEMU process and that one hidden member;
  // lifecycle cleanup must independently observe the entire cgroup absent.
  assert.deepEqual(
    resources["cgroup.procs"].trim().split(/\s+/).sort(),
    ["0", String(pid)].sort(),
  );
  assert.match(
    limits,
    /^Max file size\s+18253611008\s+18253611008\s+bytes[ \t]*$/m,
  );
  assert.deepEqual(mount.hiddenPaths, {
    "/mnt/c": false,
    "/home/duncan/.ssh": false,
    "/root/.ssh": false,
  });
  assert.equal(mount.dockerSocketMode, 0);
  assert.match(
    mount.mounts,
    / \/systemd\/inaccessible\/sock \/run\/docker.sock ro,/,
  );
  assert.notEqual(mount.mountNamespace, mount.readerMountNamespace);
  assert.equal(observation.mounts, mount.mounts);
  const properties = Object.fromEntries(
    observation.unitProperties
      .trim()
      .split("\n")
      .map((line) => {
        const index = line.indexOf("=");
        assert(index > 0);
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  for (const [name, value] of Object.entries({
    User: "65534",
    Group: "65534",
    SupplementaryGroups: "993",
    MemoryMax: "4294967296",
    MemorySwapMax: "0",
    TasksMax: "64",
    LimitFSIZE: "18253611008",
    PrivateNetwork: "yes",
    ProtectHome: "tmpfs",
    ProtectSystem: "strict",
    NoNewPrivileges: "yes",
    CapabilityBoundingSet: "",
    DevicePolicy: "closed",
    DeviceAllow: "/dev/kvm rw",
    RuntimeMaxUSec: "30min",
    CPUQuotaPerSecUSec: "2s",
    MainPID: String(pid),
  }))
    assert.equal(properties[name], value, name);
  assert.match(properties.InvocationID, /^[a-f0-9]{32}$/);
  assert.equal(
    "/sys/fs/cgroup" + properties.ControlGroup,
    observation.cgroupPath,
  );
}

export function validateDockerGuestAdmission(guest, binding) {
  validateDockerHostBinding(binding);
  assert.equal(guest.platform, "linux");
  assert.match(guest.kernel, /^\d+\.\d+\.\d+-\d+-generic$/);
  assert.match(guest.osRelease, /^ID=ubuntu$/m);
  assert.match(guest.osRelease, /^VERSION_ID="24\.04"$/m);
  assert.deepEqual(guest.networkInterfaces, ["lo"]);
  assert.match(guest.bootId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.match(guest.mounts, / - ext4 \/dev\/vda1 /);
  assert.match(guest.mounts, / \/opt\/input ro,[^\n]* - iso9660 \/dev\/vdc /);
  assert(!/ - (?:9p|virtiofs|nfs|cifs|drvfs) /.test(guest.mounts));
  for (const controller of ["cpu", "memory", "pids"])
    assert(guest.cgroupControllers.includes(controller));
  assert.equal(guest.nodeVersion, "v24.18.0");
  assert.equal(guest.pnpmVersion, "11.15.1");
  assert.equal(guest.dockerVersion.Server.Version, "29.1.3");
  assert.equal(guest.image.length, 1);
  assert.equal(guest.image[0].Id, binding.imageDigest);
  assert.deepEqual(guest.source, {
    commit: binding.sourceCommit,
    tree: binding.sourceTree,
    status: "",
    privateRefs: "",
  });
  assert.deepEqual(guest.forbiddenPaths, {
    "/mnt/c": false,
    "/mnt/wsl": false,
    "/home/duncan/.ssh": false,
    "/root/.ssh": false,
    "/work/source/artifacts/orchestrator/state/state.json": false,
  });
}

export function auditDockerHostLifecycle({
  expected,
  report,
  mount,
  events,
  qmp,
  hostProgram,
  archive,
}) {
  validateDockerHostBinding(expected.binding);
  assert.equal(dockerHostSha256(hostProgram), expected.hostRunnerSha256);
  assert.equal(report.schemaVersion, "orch-c3-host.v1");
  assert.deepEqual(report.binding, expected.binding);
  assert.equal(report.status, "OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT");
  assert.equal(report.controllerDispatched, false);
  assert.equal(report.completionEligible, false);
  assert.deepEqual(report.launcher, {
    uid: 0,
    platform: "linux",
    kernel: "6.6.87.2-microsoft-standard-WSL2",
  });
  assert.equal(report.unit, `orch-c3-${expected.binding.runId}.service`);
  assert.equal(
    report.hostBefore.cgroupPath,
    "/sys/fs/cgroup/system.slice/" + report.unit,
  );
  validateDockerHostResources(report.hostBefore, mount);
  validateDockerGuestAdmission(report.guestReady, expected.binding);
  const responses = new Map();
  const requests = new Map();
  for (const entry of qmp) {
    if (entry.direction === "sent") {
      assert(!requests.has(entry.value.id));
      requests.set(entry.value.id, entry.value.execute);
    } else if (entry.value.id !== undefined) {
      assert(requests.has(entry.value.id));
      assert(!responses.has(requests.get(entry.value.id)));
      assert(!entry.value.error);
      responses.set(requests.get(entry.value.id), entry.value.return);
    }
  }
  for (const [command, value] of Object.entries(report.hostBefore.qmp))
    assert.deepEqual(
      responses.get(command === "network" ? "human-monitor-command" : command),
      value,
    );
  assert.equal(responses.get("query-kvm").enabled, true);
  validateDockerHostThreadPool(responses.get("qom-get"));
  assert.deepEqual(
    qmp.find(
      (entry) =>
        entry.direction === "sent" && entry.value.execute === "qom-get",
    ).value.arguments,
    { path: "/objects/orch-main", property: "thread-pool-max" },
  );
  assert.equal(responses.get("query-status").status, "prelaunch");
  assert.equal(responses.get("query-uuid").UUID, expected.binding.runId);
  assert.equal(
    responses.get("query-memory-size-summary")["base-memory"],
    DOCKER_HOST_LIMITS.guestMemoryBytes,
  );
  assert.equal(responses.get("query-cpus-fast").length, 2);
  assert.equal(responses.get("human-monitor-command").trim(), "");
  const blocks = responses.get("query-block");
  assert.equal(blocks.length, 3);
  for (const [index, path] of [
    report.directory + "/overlay.qcow2",
    report.directory + "/seed.iso",
    expected.input.path,
  ].entries()) {
    // The writable overlay has one fixed path; only the two input disks are read-only.
    assert.equal(blocks[index].inserted.file, path);
    assert.equal(blocks[index].inserted.ro, index > 0);
  }
  assert.equal(blocks[0].inserted.backing_file, expected.base.path);
  validateDockerHostDisk(blocks[0].inserted.image["virtual-size"]);
  for (const bus of responses.get("query-pci"))
    for (const device of bus.devices)
      assert.notEqual(device.class_info.class >> 8, 2);
  assert(responses.has("cont") && responses.has("quit"));
  const sent = [...requests.values()];
  assert(sent.indexOf("cont") > sent.indexOf("query-block"));
  assert(sent.indexOf("quit") > sent.indexOf("cont"));
  const received = events.filter((e) => e.direction === "received");
  for (const event of received) {
    assert.equal(event.value.runId, expected.binding.runId);
    assert.equal(event.value.nonce, expected.binding.nonce);
    assert(!["failure", "export-failure"].includes(event.value.kind));
  }
  const positions = [
    events.findIndex((e) => e.value?.kind === "host-ready"),
    events.findIndex(
      (e) => e.direction === "sent" && e.kind === "admit-oci-probe",
    ),
    events.findIndex((e) => e.value?.kind === "oci-completed"),
    events.findIndex((e) => e.value?.kind === "archive-end"),
    events.findIndex((e) => e.value?.kind === "complete"),
  ];
  assert(
    positions.every(
      (value, index) =>
        value >= 0 && (index === 0 || value > positions[index - 1]),
    ),
  );
  assert.equal(events.filter((e) => e.kind === "admit-oci-probe").length, 1);
  assert.deepEqual(events[positions[0]].value.observation, report.guestReady);
  assert.equal(archive.length, report.archive.bytes);
  assert(
    archive.length > 0 && archive.length < DOCKER_HOST_LIMITS.transferBytes,
  );
  assert.equal(dockerHostSha256(archive), report.archive.sha256);
  assert.equal(events[positions[3]].value.sha256, report.archive.sha256);
  for (const key of [
    "pidAbsent",
    "cgroupAbsent",
    "directoryAbsent",
    "cleanupVerified",
  ])
    assert.equal(report[key], true, key);
  assert.equal(report.unitLauncherExit, 0);
  assert.match(report.unitAfter.stdout, /^MainPID=0$/m);
  assert.match(report.unitAfter.stdout, /^LoadState=not-found$/m);
  assert.match(report.unitAfter.stdout, /^ActiveState=inactive$/m);
  assert.equal(report.failure, undefined);
  assert.equal(report.cleanupFailure, undefined);
  assert(
    report.durationMs > 0 &&
      report.durationMs <= DOCKER_HOST_LIMITS.deadlineMs + 30_000,
  );
  const pins = [expected.base, expected.input, ...expected.launchers];
  const hashes = Object.fromEntries(pins.map((pin) => [pin.path, pin.sha256]));
  assert.deepEqual(report.inputHashesBefore, hashes);
  assert.deepEqual(report.inputHashesAfter, hashes);
  assert.match(report.packageStatusBefore, /^[a-f0-9]{64}$/);
  assert.equal(report.packageStatusBefore, report.packageStatusAfter);
  return {
    status: "PASS",
    claimScope: "one-disposable-linux-host-lifecycle",
    completionEligible: false,
    sourceReadiness: false,
    nativeWindows: false,
  };
}
