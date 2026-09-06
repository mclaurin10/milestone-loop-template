import { describe, expect, it } from "vitest";
import {
  DOCKER_HOST_AUTHORITY,
  validateDockerHostBinding,
  validateDockerHostResources,
  validateDockerGuestAdmission,
  validateDockerHostThreadPool,
  validateDockerHostDisk,
} from "./qualification-docker-host.mjs";

const binding = () => ({
  authorityDigest: DOCKER_HOST_AUTHORITY,
  activeAuthorityEpoch: "legacy-source.v1",
  purpose: "candidate-support",
  runId: "12345678-1234-1234-1234-123456789abc",
  nonce: "a".repeat(64),
  inputManifestSha256: "b".repeat(64),
  sourceCommit: "c".repeat(40),
  sourceTree: "d".repeat(40),
  imageDigest:
    "sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad",
});
function resources() {
  const mounts =
    "10 1 0:1 /systemd/inaccessible/sock /run/docker.sock ro,nosuid - tmpfs none rw\n";
  return {
    observation: {
      pid: 123,
      status:
        "Pid:\t123\nUid:\t65534\t65534\t65534\t65534\nGid:\t65534\t65534\t65534\t65534\nGroups:\t993 65534\n" +
        ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"]
          .map((key) => key + ":\t0000000000000000\n")
          .join("") +
        "NoNewPrivs:\t1\nSeccomp:\t2\n",
      resources: {
        "memory.max": "4294967296\n",
        "memory.swap.max": "0\n",
        "cpu.max": "200000 100000\n",
        "pids.max": "64\n",
        "cgroup.procs": "123\n0\n",
      },
      limits:
        "Max file size             18253611008           18253611008           bytes     \n",
      mounts,
      cgroupPath: "/sys/fs/cgroup/system.slice/example.service",
      unitProperties: Object.entries({
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
        MainPID: "123",
        InvocationID: "e".repeat(32),
        ControlGroup: "/system.slice/example.service",
      })
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    },
    mount: {
      hiddenPaths: {
        "/mnt/c": false,
        "/home/duncan/.ssh": false,
        "/root/.ssh": false,
      },
      dockerSocketMode: 0,
      mounts,
      mountNamespace: "mnt:[2]",
      readerMountNamespace: "mnt:[1]",
    },
  };
}
function guest() {
  const expected = binding();
  return {
    platform: "linux",
    kernel: "6.8.0-138-generic",
    osRelease: 'ID=ubuntu\nVERSION_ID="24.04"\n',
    networkInterfaces: ["lo"],
    bootId: "87654321-1234-1234-1234-123456789abc",
    mounts:
      "1 0 8:1 / / rw - ext4 /dev/vda1 rw\n2 1 0:3 / /opt/input ro,nosuid,nodev - iso9660 /dev/vdc ro\n",
    cgroupControllers: ["cpu", "memory", "pids"],
    nodeVersion: "v24.18.0",
    pnpmVersion: "11.15.1",
    dockerVersion: { Server: { Version: "29.1.3" } },
    image: [{ Id: expected.imageDigest }],
    source: {
      commit: expected.sourceCommit,
      tree: expected.sourceTree,
      status: "",
      privateRefs: "",
    },
    forbiddenPaths: {
      "/mnt/c": false,
      "/mnt/wsl": false,
      "/home/duncan/.ssh": false,
      "/root/.ssh": false,
      "/work/source/artifacts/orchestrator/state/state.json": false,
    },
  };
}
describe("disposable Docker host admission", () => {
  it("rejects an unbounded or different provisioning disk", () => {
    validateDockerHostDisk(17_179_869_184);
    for (const capacity of [0, 8_589_934_592, 34_359_738_368, undefined])
      expect(() => validateDockerHostDisk(capacity)).toThrow();
  });
  it("bounds the I/O pool below the whole-unit task ceiling", () => {
    validateDockerHostThreadPool(16);
    for (const value of [64, 0, undefined, "16"])
      expect(() => validateDockerHostThreadPool(value)).toThrow();
  });
  it("accepts the finite resource policy and inaccessible socket semantics", () => {
    const sample = resources();
    validateDockerHostResources(sample.observation, sample.mount);
    validateDockerGuestAdmission(guest(), binding());
  });
  it.each(["memory.max", "memory.swap.max", "cpu.max", "pids.max"])(
    "rejects an unlimited %s at the actual cgroup readback",
    (name) => {
      const sample = resources();
      sample.observation.resources[name] = "max\n";
      expect(() =>
        validateDockerHostResources(sample.observation, sample.mount),
      ).toThrow();
    },
  );
  it.each(["123\n", "123\n0\n0\n", "123\n0\n456\n"])(
    "rejects a missing or additional cgroup member: %s",
    (members) => {
      const sample = resources();
      sample.observation.resources["cgroup.procs"] = members;
      expect(() =>
        validateDockerHostResources(sample.observation, sample.mount),
      ).toThrow();
    },
  );
  it.each(["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])(
    "rejects authority retained in %s",
    (name) => {
      const sample = resources();
      sample.observation.status = sample.observation.status.replace(
        name + ":\t0000000000000000",
        name + ":\t0000000000000001",
      );
      expect(() =>
        validateDockerHostResources(sample.observation, sample.mount),
      ).toThrow();
    },
  );
  it.each([
    [
      "workstation groups",
      (s) => {
        s.observation.status = s.observation.status.replace(
          "Groups:\t993 65534",
          "Groups:\t108 993 65534",
        );
      },
    ],
    [
      "root QEMU",
      (s) => {
        s.observation.status = s.observation.status.replace(
          /Uid:[^\n]+/,
          "Uid:\t0\t0\t0\t0",
        );
      },
    ],
    [
      "no seccomp",
      (s) => {
        s.observation.status = s.observation.status.replace(
          "Seccomp:\t2",
          "Seccomp:\t0",
        );
      },
    ],
    [
      "no file bound",
      (s) => {
        s.observation.limits = "Max file size unlimited unlimited bytes\n";
      },
    ],
    [
      "daemon socket",
      (s) => {
        s.mount.dockerSocketMode = 0o660;
      },
    ],
    [
      "unmasked socket",
      (s) => {
        s.mount.mounts = "";
      },
    ],
    [
      "shared namespace",
      (s) => {
        s.mount.mountNamespace = s.mount.readerMountNamespace;
      },
    ],
    [
      "host workspace",
      (s) => {
        s.mount.hiddenPaths["/mnt/c"] = true;
      },
    ],
    [
      "no provider deadline",
      (s) => {
        s.observation.unitProperties = s.observation.unitProperties.replace(
          "RuntimeMaxUSec=30min",
          "RuntimeMaxUSec=infinity",
        );
      },
    ],
  ])("rejects %s before guest admission", (_label, mutate) => {
    const sample = resources();
    mutate(sample);
    expect(() =>
      validateDockerHostResources(sample.observation, sample.mount),
    ).toThrow();
  });
  it.each([
    ["network device", (s) => s.networkInterfaces.push("eth0")],
    [
      "host mount",
      (s) => {
        s.mounts += "3 1 0:5 / /shared ro - virtiofs shared ro\n";
      },
    ],
    [
      "wrong Node",
      (s) => {
        s.nodeVersion = "v24.0.0";
      },
    ],
    [
      "wrong pnpm",
      (s) => {
        s.pnpmVersion = "11.0.0";
      },
    ],
    [
      "wrong image",
      (s) => {
        s.image[0].Id = "sha256:" + "f".repeat(64);
      },
    ],
    [
      "dirty candidate",
      (s) => {
        s.source.status = " M package.json\n";
      },
    ],
    [
      "adopted private state",
      (s) => {
        s.source.privateRefs = "refs/milestone-loop/state\n";
      },
    ],
    [
      "guest acting as Windows proof",
      (s) => {
        s.platform = "win32";
      },
    ],
  ])("rejects %s at the guest boundary", (_label, mutate) => {
    const sample = guest();
    mutate(sample);
    expect(() => validateDockerGuestAdmission(sample, binding())).toThrow();
  });
  it.each([
    "authorityDigest",
    "activeAuthorityEpoch",
    "purpose",
    "nonce",
    "sourceCommit",
  ])("rejects changed binding %s", (name) => {
    const expected = binding();
    expected[name] = "untrusted";
    expect(() => validateDockerHostBinding(expected)).toThrow();
  });
});
