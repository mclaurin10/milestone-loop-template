import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  VM_AUTHORITY_DIGEST,
  VM_LIMITS,
  auditVmLifecycle,
  guestProgram,
  parseGuest,
  sha256,
  validateVmBinding,
  vmArguments,
} from "./qualification-vm-lifecycle.mjs";
const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function sample() {
  const root = "/home/duncan/oc2-fixture",
    directory = root + "/guest-fixture";
  const binding = {
    authorityDigest: VM_AUTHORITY_DIGEST,
    purpose: "candidate-support",
    runId: "12345678-1234-1234-1234-123456789abc",
    nonce: "a".repeat(64),
    sourceCommit: "b".repeat(40),
    sourceTree: "c".repeat(40),
  };
  const inputs = {
    image: { path: root + "/ubuntu.img", bytes: 100, sha256: "d".repeat(64) },
    launchers: [
      { path: root + "/provider/usr/bin/qemu-system-x86_64" },
      { path: root + "/provider/usr/bin/qemu-img" },
      { path: root + "/provider/usr/bin/genisoimage" },
    ],
    firmware: [],
  };
  const expected = {
    root,
    binding,
    inputs,
    collectorSha256: "e".repeat(64),
    preparationSha256: "f".repeat(64),
    providerInventorySha256: "1".repeat(64),
    packageStatusSha256: "2".repeat(64),
    launcherKernel: "6.6.87.2-microsoft-standard-WSL2",
  };
  const guest = {
    kind: "orch-c2-guest.v1",
    runId: binding.runId,
    nonce: binding.nonce,
    platform: "linux",
    architecture: "x86_64",
    kernel: "6.8.0-101-generic",
    uid: 0,
    osRelease: 'ID=ubuntu\nVERSION_ID="24.04"\n',
    bootId: "87654321-1234-1234-1234-123456789abc",
    net: ["lo"],
    mounts: "1 0 8:1 / / rw - ext4 /dev/vda1 rw\n",
    markerExisted: false,
    markerReadback: binding.nonce,
    forbiddenPaths: {
      "/mnt/c": false,
      "/home/duncan": false,
      "/run/docker.sock": false,
      "/var/run/docker.sock": false,
    },
  };
  const transcript = [];
  const add = (execute, result) => {
    const id =
      transcript.filter((entry) => entry.direction === "sent").length + 1;
    transcript.push(
      {
        direction: "sent",
        value: {
          execute,
          ...(execute === "human-monitor-command"
            ? { arguments: { "command-line": "info network" } }
            : {}),
          id,
        },
      },
      { direction: "received", value: { return: result, id } },
    );
  };
  add("qmp_capabilities", {});
  add("query-name", { name: "orch-c2-" + binding.runId });
  add("query-uuid", { UUID: binding.runId });
  add("query-kvm", { enabled: false, present: true });
  add("query-status", { status: "prelaunch" });
  add("query-memory-size-summary", {
    "base-memory": VM_LIMITS.memoryMiB * 1024 * 1024,
  });
  add("query-cpus-fast", [{}, {}]);

  add("query-block", [
    {
      inserted: {
        file: directory + "/overlay.qcow2",
        backing_file: inputs.image.path,
      },
    },
    { inserted: { file: directory + "/seed.iso", ro: true } },
  ]);
  add("query-chardev", [
    {
      filename: `unix:${directory}/qmp.sock,server=on`,
      label: "compat_monitor0",
    },
    { filename: "stdio", label: "serial0" },
  ]);
  add("query-pci", [{ devices: [{ class_info: { class: 1536 } }] }]);
  add("human-monitor-command", "");
  add("cont", {});
  add("quit", {});
  const serial = "ORCH_C2_GUEST=" + JSON.stringify(guest) + "\n";
  const argv = [
    inputs.launchers[0].path,
    ...vmArguments(root, directory, binding),
  ];
  const report = {
    schemaVersion: "orch-c2-vm-lifecycle.v1",
    binding,
    inputs,
    directory,
    collectorSha256: expected.collectorSha256,
    preparationSha256: expected.preparationSha256,
    status: "OBSERVED",
    hostQualification: "NOT_READY",
    controllerDispatched: false,
    completionEligible: false,
    limits: VM_LIMITS,
    launcher: {
      platform: "linux",
      nodeVersion: "v24.18.0",
      uid: 1000,
      kernel: expected.launcherKernel,
      wsl: true,
    },
    providerBefore: expected.providerInventorySha256,
    providerAfter: expected.providerInventorySha256,
    imageBefore: inputs.image.sha256,
    imageAfter: inputs.image.sha256,
    packageStatusBefore: expected.packageStatusSha256,
    packageStatusAfter: expected.packageStatusSha256,
    sentinelBefore: sha256(binding.nonce),
    sentinelAfter: sha256(binding.nonce),
    process: {
      argv,
      pid: 300,
      exitCode: 0,
      signal: null,
      failure: null,
      durationMs: 1000,
    },
    proc: {
      executable: inputs.launchers[0].path,
      argv,
      status:
        "Pid:\t300\nUid:\t1000\t1000\t1000\t1000\nCapEff:\t0000000000000000\nNoNewPrivs:\t1\nSeccomp:\t2\n",
    },
    cleanup: { processAbsent: true, directoryAbsent: true, error: null },
    serialSha256: sha256(serial),
    qmpSha256: sha256(JSON.stringify(transcript) + "\n"),
    guest,
  };
  return {
    expected: structuredClone(expected),
    report: structuredClone(report),
    serial,
    transcript: structuredClone(transcript),
  };
}
function audit(value) {
  return auditVmLifecycle(
    value.report,
    value.expected,
    value.serial,
    value.transcript,
  );
}
describe("bounded VM lifecycle evidence", () => {
  it("accepts observed diagnostic lifecycle only as completion-ineligible NOT_READY host evidence", () => {
    expect(audit(sample())).toEqual({
      status: "PASS",
      guestPlatform: "linux",
      hostQualification: "NOT_READY",
      controllerDispatched: false,
      completionEligible: false,
    });
  });
  it.each([
    ["host qualification", (r) => (r.hostQualification = "PASS")],
    ["completion", (r) => (r.completionEligible = true)],
    ["controller dispatch", (r) => (r.controllerDispatched = true)],
    ["run binding", (r) => (r.binding.nonce = "9".repeat(64))],
    ["source substitution", (r) => (r.binding.sourceTree = "9".repeat(40))],
    ["collector substitution", (r) => (r.collectorSha256 = "9".repeat(64))],
    ["preparation substitution", (r) => (r.preparationSha256 = "9".repeat(64))],
    ["provider mutation", (r) => (r.providerAfter = "9".repeat(64))],
    ["image mutation", (r) => (r.imageAfter = "9".repeat(64))],
    ["host package mutation", (r) => (r.packageStatusAfter = "9".repeat(64))],
    ["outside sentinel mutation", (r) => (r.sentinelAfter = "9".repeat(64))],
    ["native Windows relabel", (r) => (r.launcher.platform = "win32")],
    ["runtime mismatch", (r) => (r.launcher.nodeVersion = "v22.0.0")],
    ["privileged launcher", (r) => (r.launcher.uid = 0)],
    ["guest process failure", (r) => (r.process.exitCode = 1)],
    ["timeout", (r) => (r.process.failure = "timeout")],
    ["leaked process", (r) => (r.cleanup.processAbsent = false)],
    ["leaked guest directory", (r) => (r.cleanup.directoryAbsent = false)],
    ["cleanup failure", (r) => (r.cleanup.error = "foreign entry")],
    ["unobserved completion", (r) => (r.status = "ERROR")],
    [
      "extra mount argv",
      (r) => r.process.argv.push("-virtfs", "local,path=/mnt/c,mount_tag=host"),
    ],
    ["actual argv drift", (r) => r.proc.argv.push("-nic", "user")],
  ])("rejects %s", (_, mutate) => {
    const value = sample();
    mutate(value.report);
    expect(() => audit(value)).toThrow();
  });
  it("rejects one-byte serial mutation before semantic interpretation", () => {
    const value = sample();
    value.serial += " ";
    expect(() => audit(value)).toThrow();
  });
  it("rejects QMP mutation even with a recomputed transcript digest", () => {
    const value = sample();
    value.transcript.find((e) => e.value.return?.["base-memory"]).value.return[
      "base-memory"
    ] *= 2;
    value.report.qmpSha256 = sha256(JSON.stringify(value.transcript) + "\n");
    expect(() => audit(value)).toThrow();
  });
  it("rejects missing QMP quit despite a successful process exit", () => {
    const value = sample();
    value.transcript = value.transcript.slice(0, -2);
    value.report.qmpSha256 = sha256(JSON.stringify(value.transcript) + "\n");
    expect(() => audit(value)).toThrow();
  });
  it("rejects extra guest network and a reused persistent marker", () => {
    const value = sample();
    for (const guest of [
      { ...value.report.guest, net: ["eth0", "lo"] },
      { ...value.report.guest, markerExisted: true },
    ])
      expect(() =>
        parseGuest(
          "ORCH_C2_GUEST=" + JSON.stringify(guest) + "\n",
          value.expected.binding,
        ),
      ).toThrow();
  });
  it("rejects missing, duplicate and WSL guest observations", () => {
    const value = sample();
    for (const serial of [
      "",
      value.serial + value.serial,
      value.serial.replace(
        "6.8.0-101-generic",
        "6.6.87.2-microsoft-standard-WSL2",
      ),
    ])
      expect(() => parseGuest(serial, value.expected.binding)).toThrow();
  });
  it.each([
    "/tmp/guest-test",
    "/home/duncan/oc2-fixture/../guest-test",
    "/home/duncan/oc2-fixture/guest-x,server=on",
    "/home/duncan/oc2-other/guest-test",
  ])("refuses unsafe/foreign guest path %s", (path) => {
    const value = sample();
    expect(() =>
      vmArguments(value.expected.root, path, value.expected.binding),
    ).toThrow();
  });
  it("refuses a full-qualification purpose and extra authority fields", () => {
    const { binding } = sample().expected;
    expect(() =>
      validateVmBinding({ ...binding, purpose: "full-source-qualification" }),
    ).toThrow();
    expect(() => validateVmBinding({ ...binding, approved: true })).toThrow();
  });
  it("emits only a fixed diagnostic program whose fresh marker binds the outer nonce", () => {
    const { binding } = sample().expected;
    const program = guestProgram(binding);
    expect(program).toContain(binding.nonce);
    expect(program).toContain("/dev/ttyS0");
    expect(program).not.toMatch(/subprocess|socket|docker run|controller/);
  });
  it("refuses invalid CLI input before creating output or launching a program", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "orch-c2-cli-"));
    roots.push(root);
    const input = resolve(root, "input.json"),
      output = resolve(root, "must-not-exist");
    await writeFile(
      input,
      JSON.stringify({ binding: { purpose: "full-source-qualification" } }),
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [resolve("tools/qualification-vm-lifecycle.mjs"), input, output],
        { timeout: 15000, stdio: "pipe", windowsHide: true },
      ),
    ).toThrow();
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
