import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir, release } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  APPROVED_AUTHORITY_DIGEST,
  HOST_DISCOVERY_LIMITS,
  HOST_DISCOVERY_NAMES,
  auditHostDiscovery,
  discoverQualificationHost,
  discoverySearch,
} from "./qualification-host-discovery.mjs";

const roots = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const binding = {
  purpose: "candidate-support",
  runId: "host-discovery-test",
  nonce: "a".repeat(64),
  route: "test-fixture-only",
  sourceCommit: "b".repeat(40),
  sourceTree: "c".repeat(40),
  authorityDigest: APPROVED_AUTHORITY_DIGEST,
  scannerSha256: hash(
    await readFile(
      new URL("./qualification-host-discovery.mjs", import.meta.url),
    ),
  ),
};
const bytesOf = (report) => Buffer.from(JSON.stringify(report));
const expectedFor = (bytes) => ({
  binding,
  platform: process.platform,
  kernelRelease: release(),
  reportSha256: hash(bytes),
});
const audit = (report) => {
  const bytes = bytesOf(report);
  return auditHostDiscovery(bytes, expectedFor(bytes));
};
const pathFor = (root, name, script = false) =>
  join(
    root,
    name + (process.platform === "win32" ? (script ? ".cmd" : ".exe") : ""),
  );
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "host-discovery-")));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("launch-free qualification host discovery", () => {
  it("observes a real installer-shaped script without executing its side effect", async () => {
    const root = await fixture();
    const marker = join(root, "installer-was-run");
    const launcher = pathFor(root, "lxc", true);
    const script =
      process.platform === "win32"
        ? `@echo off\r\necho installed > "${marker}"\r\n`
        : `#!/bin/sh\nprintf installed > '${marker}'\n`;
    await writeFile(launcher, script, { mode: 0o755 });
    const report = await discoverQualificationHost(binding, root);
    const entry = report.launchers.find((item) => item.name === "lxc");
    expect(entry.kind).toBe("regular-file");
    expect(entry.sample.format).toBe(
      process.platform === "win32" ? "script-extension" : "shebang-script",
    );
    expect(Buffer.from(entry.sample.base64, "base64").toString()).toBe(script);
    await expect(access(marker)).rejects.toThrow();
    expect(audit(report).qualification.status).toBe("NOT_READY");
  });

  it("retains the earlier script instead of selecting a later binary", async () => {
    const first = await fixture();
    const second = await fixture();
    await writeFile(pathFor(first, "docker", true), "#!/bin/sh\nexit 99\n");
    await writeFile(
      pathFor(second, "docker"),
      Buffer.from("MZ-not-a-real-binary"),
    );
    const report = await discoverQualificationHost(
      binding,
      [first, second].join(delimiter),
    );
    expect(report.launchers[0].selectedPath).toBe(
      pathFor(first, "docker", true),
    );
    expect(report.launchers[0].searchIndex).toBe(0);
    audit(report);
  });

  it("does not traverse a linked directory to read a launcher", async () => {
    const root = await fixture();
    const target = await fixture();
    await writeFile(
      pathFor(target, "docker"),
      "MZ-secret-must-not-be-exported",
    );
    const linked = join(root, "linked");
    await symlink(
      target,
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
    const report = await discoverQualificationHost(binding, linked);
    expect(report.launchers[0].kind).toBe("linked-or-aliased-path");
    expect(report.launchers[0].sample).toBe(null);
    expect(JSON.stringify(report)).not.toContain("secret-must-not");
    audit(report);
  });

  it("records a directory in command position without reading it", async () => {
    const root = await fixture();
    await mkdir(pathFor(root, "docker"));
    const report = await discoverQualificationHost(binding, root);
    expect(report.launchers[0].kind).toBe("non-file");
    audit(report);
  });

  it("bounds content reads and labels a binary signature as prefix evidence only", async () => {
    const root = await fixture();
    const data = Buffer.alloc(HOST_DISCOVERY_LIMITS.sampleBytes + 8192, 65);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(data);
    await writeFile(pathFor(root, "docker"), data);
    const report = await discoverQualificationHost(binding, root);
    expect(report.launchers[0].sample).toMatchObject({
      bytes: HOST_DISCOVERY_LIMITS.sampleBytes,
      format: "elf-prefix",
      completeFile: false,
    });
    expect(report.launchers[0].fileBytes).toBe(data.length);
    expect(audit(report).completion.eligible).toBe(false);
  });

  it("retains every fixed name when no launcher is present", async () => {
    const report = await discoverQualificationHost(binding, await fixture());
    expect(report.launchers.map((item) => item.name)).toEqual(
      HOST_DISCOVERY_NAMES,
    );
    expect(report.launchers.every((item) => item.kind === "missing")).toBe(
      true,
    );
    audit(report);
  });

  it("ignores relative, empty and network PATH entries with an explicit count", () => {
    const search = discoverySearch(
      "win32",
      ";.;relative;\\\\server\\share;C:\\Tools",
    );
    expect(search.ignoredEntries).toBe(4);
    expect(search.directories).toEqual(["C:\\Tools"]);
    expect(search.candidates[0].paths[0].path).toBe("C:\\Tools\\docker.com");
  });

  it.each([
    ["linux", "/a:".repeat(HOST_DISCOVERY_LIMITS.pathEntries)],
    ["linux", "/" + "a".repeat(HOST_DISCOVERY_LIMITS.pathBytes)],
    ["linux", "/a\0b"],
    ["darwin", "/usr/bin"],
  ])("refuses unsafe or unbounded PATH input (%s)", (platform, path) => {
    expect(() => discoverySearch(platform, path)).toThrow();
  });

  it("refuses a stale scanner pin before inspecting launchers", async () => {
    await expect(
      discoverQualificationHost(
        { ...binding, scannerSha256: "f".repeat(64) },
        await fixture(),
      ),
    ).rejects.toThrow("Scanner bytes differ");
  });

  it("rejects bytes changed after the trusted capture", async () => {
    const report = structuredClone(
      await discoverQualificationHost(binding, await fixture()),
    );
    const original = bytesOf(report);
    report.binding.nonce = "d".repeat(64);
    expect(() =>
      auditHostDiscovery(bytesOf(report), expectedFor(original)),
    ).toThrow("Discovery bytes changed");
  });

  it.each([
    ["nonce", "d".repeat(64)],
    ["purpose", "full-source-qualification"],
    ["sourceCommit", "d".repeat(40)],
    ["sourceTree", "d".repeat(40)],
    ["authorityDigest", "d".repeat(64)],
    ["scannerSha256", "d".repeat(64)],
    ["runId", "another-run"],
    ["route", "another-host"],
  ])(
    "rejects a self-consistent report with a different %s",
    async (key, value) => {
      const report = structuredClone(
        await discoverQualificationHost(binding, await fixture()),
      );
      report.binding[key] = value;
      expect(() => audit(report)).toThrow();
    },
  );

  it.each([
    (r) => {
      r.controller.platform =
        r.controller.platform === "linux" ? "win32" : "linux";
    },
    (r) => {
      r.controller.wsl = !r.controller.wsl;
    },
    (r) => {
      r.controller.kernelRelease = "forged-kernel";
    },
    (r) => {
      r.controller.nodeVersion = "v25.9.0";
    },
    (r) => {
      r.launchers.pop();
    },
    (r) => {
      r.launchers.reverse();
    },
    (r) => {
      r.qualification.status = "PASS";
    },
    (r) => {
      r.qualification.generalDockerControllerHostQualified = true;
    },
    (r) => {
      r.qualification.nativeWindowsQualified = true;
    },
    (r) => {
      r.completion.eligible = true;
    },
    (r) => {
      r.maintainerApproved = true;
    },
  ])(
    "refuses forged platform, coverage or qualification claims (%#)",
    async (mutate) => {
      const report = structuredClone(
        await discoverQualificationHost(binding, await fixture()),
      );
      mutate(report);
      expect(() => audit(report)).toThrow();
    },
  );

  it.each([
    (e) => {
      e.sample.sha256 = "f".repeat(64);
    },
    (e) => {
      e.sample.format = "elf-prefix";
    },
    (e) => {
      e.sample.bytes += 1;
    },
    (e) => {
      e.sample.completeFile = false;
    },
    (e) => {
      e.sample.base64 += "!";
    },
    (e) => {
      e.searchIndex = 128;
    },
    (e) => {
      e.selectedPath = "../docker";
    },
  ])(
    "independently rejects malformed observed launcher data (%#)",
    async (mutate) => {
      const root = await fixture();
      await writeFile(pathFor(root, "docker"), "MZ-bounded-prefix");
      const report = await discoverQualificationHost(binding, root);
      mutate(report.launchers[0]);
      expect(() => audit(report)).toThrow();
    },
  );

  it("refuses an oversized retained report before parsing it", () => {
    const bytes = Buffer.alloc(HOST_DISCOVERY_LIMITS.reportBytes + 1);
    expect(() => auditHostDiscovery(bytes, expectedFor(bytes))).toThrow();
  });
});
