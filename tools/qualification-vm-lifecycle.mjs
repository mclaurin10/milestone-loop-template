import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { connect } from "node:net";
import { release } from "node:os";
import { posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// A fixed trusted diagnostic, deliberately not a controller/provider admission API.
export const VM_AUTHORITY_DIGEST =
  "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108";
export const VM_LIMITS = Object.freeze({
  memoryMiB: 1024,
  cpus: 2,
  timeoutMs: 300_000,
  outputBytes: 2_097_152,
  graceMs: 5_000,
});
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const hashPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function validateVmBinding(binding) {
  assert.deepEqual(
    Object.keys(binding).sort(),
    [
      "authorityDigest",
      "nonce",
      "purpose",
      "runId",
      "sourceCommit",
      "sourceTree",
    ].sort(),
  );
  assert.equal(binding.authorityDigest, VM_AUTHORITY_DIGEST);
  assert.equal(binding.purpose, "candidate-support");
  assert.match(binding.runId, uuidPattern);
  assert.match(binding.nonce, hashPattern);
  for (const key of ["sourceCommit", "sourceTree"])
    assert.match(binding[key], /^[a-f0-9]{40}$/);
}

function safePath(path) {
  assert.equal(typeof path, "string");
  assert.match(
    path,
    /^\/home\/duncan\/oc2-[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.+-]+)*$/,
  );
  assert.equal(posix.normalize(path), path);
  assert(!path.split("/").some((part) => part === "." || part === ".."));
  return path;
}

export function vmArguments(root, directory, binding) {
  validateVmBinding(binding);
  safePath(root);
  safePath(directory);
  assert.equal(posix.dirname(directory), root);
  assert(posix.basename(directory).startsWith("guest-"));
  assert(Buffer.byteLength(`${directory}/qmp.sock`) < 100);
  return [
    "-no-user-config",
    "-nodefaults",
    "-display",
    "none",
    "-monitor",
    "none",
    "-machine",
    "pc,accel=tcg",
    "-cpu",
    "max",
    "-m",
    String(VM_LIMITS.memoryMiB),
    "-smp",
    String(VM_LIMITS.cpus),
    "-nic",
    "none",
    "-no-reboot",
    "-S",
    "-name",
    `orch-c2-${binding.runId}`,
    "-uuid",
    binding.runId,
    "-sandbox",
    "on,obsolete=deny,elevateprivileges=deny,spawn=deny,resourcecontrol=deny",
    "-L",
    `${root}/provider/usr/share/qemu`,
    "-bios",
    `${root}/provider/usr/share/seabios/bios-256k.bin`,
    "-drive",
    `file=${directory}/overlay.qcow2,if=virtio,format=qcow2`,
    "-drive",
    `file=${directory}/seed.iso,if=virtio,format=raw,readonly=on`,
    "-serial",
    "stdio",
    "-qmp",
    `unix:${directory}/qmp.sock,server=on,wait=off`,
  ];
}

export function guestProgram(binding) {
  validateVmBinding(binding);
  return `import json, os, pathlib, platform, sys\nmarker=pathlib.Path('/var/lib/orch-auth-c2-marker')\nbefore=marker.exists()\nmarker.write_text('${binding.nonce}')\nreport={'kind':'orch-c2-guest.v1','runId':'${binding.runId}','nonce':'${binding.nonce}','platform':sys.platform,'architecture':platform.machine(),'kernel':platform.release(),'uid':os.getuid(),'osRelease':pathlib.Path('/etc/os-release').read_text(),'bootId':pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'net':sorted(p.name for p in pathlib.Path('/sys/class/net').iterdir()),'mounts':pathlib.Path('/proc/self/mountinfo').read_text(),'markerExisted':before,'markerReadback':marker.read_text(),'forbiddenPaths':{p:os.path.exists(p) for p in ['/mnt/c','/home/duncan','/run/docker.sock','/var/run/docker.sock']}}\nwith open('/dev/ttyS0','w') as serial: serial.write('\\nORCH_C2_GUEST='+json.dumps(report,separators=(',',':'))+'\\n'); serial.flush()\n`;
}

export function parseGuest(serial, binding) {
  const matches = [...serial.matchAll(/^ORCH_C2_GUEST=(\{[^\r\n]+\})\r?$/gm)];
  assert.equal(
    matches.length,
    1,
    "Expected exactly one completed guest observation.",
  );
  const guest = JSON.parse(matches[0][1]);
  assert.equal(guest.kind, "orch-c2-guest.v1");
  assert.equal(guest.runId, binding.runId);
  assert.equal(guest.nonce, binding.nonce);
  assert.equal(guest.platform, "linux");
  assert.equal(guest.architecture, "x86_64");
  assert.equal(guest.uid, 0);
  assert(!/microsoft|wsl/i.test(guest.kernel));
  assert.match(guest.kernel, /^\d+\.\d+\.\d+-\d+-generic$/);
  assert.match(guest.osRelease, /^ID=ubuntu$/m);
  assert.match(guest.osRelease, /^VERSION_ID="24\.04"$/m);
  assert.match(guest.bootId, uuidPattern);
  assert.deepEqual(guest.net, ["lo"]);
  assert.equal(guest.markerExisted, false);
  assert.equal(guest.markerReadback, binding.nonce);
  assert.deepEqual(guest.forbiddenPaths, {
    "/mnt/c": false,
    "/home/duncan": false,
    "/run/docker.sock": false,
    "/var/run/docker.sock": false,
  });
  assert.match(guest.mounts, / - ext4 \/dev\/vda1 /);
  assert(!/ - (?:9p|virtiofs|nfs|cifs|drvfs) /.test(guest.mounts));
  return guest;
}

export async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function providerInventory(root) {
  const files = [];
  let bytes = 0;
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const path = `${directory}/${name}`;
      const stat = await lstat(path);
      const relative = path.slice(root.length + 1);
      assert(files.length < 5_000);
      if (stat.isSymbolicLink()) {
        const target = await readlink(path);
        assert(
          posix.resolve(directory, target).startsWith(root + "/"),
          "Provider link escapes extraction root.",
        );
        let targetPresent = true;
        try {
          assert(
            (await realpath(path)).startsWith(root + "/"),
            "Provider link escapes extraction root.",
          );
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          targetPresent = false;
        }
        files.push({ path: relative, kind: "link", target, targetPresent });
      } else if (stat.isDirectory()) await visit(path);
      else {
        assert(stat.isFile());
        bytes += stat.size;
        assert(bytes < 512 * 1024 * 1024);
        files.push({
          path: relative,
          kind: "file",
          bytes: stat.size,
          sha256: await hashFile(path),
        });
      }
    }
  }
  await visit(root);
  return files;
}

export async function verifyPinnedFile(pin, executable = false) {
  safePath(pin.path);
  assert.match(pin.sha256, hashPattern);
  const stat = await lstat(pin.path);
  assert(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(await realpath(pin.path), pin.path, "Aliased input refused.");
  assert.equal(stat.size, pin.bytes);
  assert.equal(
    await hashFile(pin.path),
    pin.sha256,
    "Pinned input bytes changed.",
  );
  if (executable) {
    const stream = createReadStream(pin.path, { start: 0, end: 3 });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(
      Buffer.concat(chunks).toString("hex"),
      "7f454c46",
      "Launcher must be an inspected ELF; scripts are never executed.",
    );
  }
}

// No recursive deletion. Foreign entries or altered ownership preserve the directory.
export async function removeOwnedGuest(directory, root, ownerBytes) {
  safePath(directory);
  safePath(root);
  assert.equal(posix.dirname(directory), root);
  assert(posix.basename(directory).startsWith("guest-"));
  assert.equal(await realpath(directory), directory);
  assert.equal(await readFile(`${directory}/owner.json`, "utf8"), ownerBytes);
  const allowed = [
    "owner.json",
    "overlay.qcow2",
    "seed.iso",
    "user-data",
    "meta-data",
    "network-config",
    "qmp.sock",
  ];
  const entries = await readdir(directory);
  assert(
    entries.every((name) => allowed.includes(name)),
    "Foreign cleanup entry; preserve all paths.",
  );
  for (const name of entries) {
    const stat = await lstat(`${directory}/${name}`);
    assert(
      !stat.isSymbolicLink() &&
        (stat.isFile() || (name === "qmp.sock" && stat.isSocket())),
    );
  }
  for (const name of entries) await unlink(`${directory}/${name}`);
  await rmdir(directory);
}

function spawnBounded(executable, args, options, timeoutMs) {
  const child = spawn(executable, args, {
    ...options,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const started = performance.now();
  let stdout = Buffer.alloc(0),
    stderr = Buffer.alloc(0),
    failure = null;
  let killTimer;
  const kill = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    killTimer ??= setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }, VM_LIMITS.graceMs);
  };
  for (const [name, stream] of [
    ["stdout", child.stdout],
    ["stderr", child.stderr],
  ])
    stream.on("data", (chunk) => {
      const old = name === "stdout" ? stdout : stderr;
      if (old.length + chunk.length > VM_LIMITS.outputBytes) {
        failure ??= "output-limit";
        kill();
      }
      const next = Buffer.concat([
        old,
        chunk.subarray(0, Math.max(0, VM_LIMITS.outputBytes - old.length)),
      ]);
      if (name === "stdout") stdout = next;
      else stderr = next;
    });
  const timer = setTimeout(() => {
    failure ??= "timeout";
    kill();
  }, timeoutMs);
  const done = new Promise((accept) => {
    child.on("error", (error) => {
      failure = error.message;
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      accept({
        argv: [executable, ...args],
        pid: child.pid ?? null,
        exitCode,
        signal,
        failure,
        durationMs: performance.now() - started,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
      });
    });
  });
  return { child, done, kill, serial: () => stdout.toString("utf8") };
}

async function openQmp(path, processRun, transcript) {
  let socket;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      socket = await new Promise((accept, reject) => {
        const value = connect(path);
        value.once("error", reject);
        value.once("connect", () => {
          value.removeListener("error", reject);
          accept(value);
        });
      });
      break;
    } catch (error) {
      if (!["ENOENT", "ECONNREFUSED"].includes(error.code)) throw error;
    }
    if (processRun.child.exitCode !== null)
      throw new Error("QEMU exited before QMP.");
    await delay(50);
  }
  assert(socket, "QMP was unavailable.");
  let pending = "",
    nextId = 0,
    greeting;
  const waiting = new Map();
  const ready = new Promise((accept) => {
    greeting = accept;
  });
  const failPending = (error) => {
    for (const { reject } of waiting.values()) reject(error);
    waiting.clear();
  };
  socket.on("error", failPending);
  socket.on("close", () => failPending(new Error("QMP closed")));
  socket.on("data", (bytes) => {
    pending += bytes.toString("utf8");
    if (
      Buffer.byteLength(pending) > VM_LIMITS.outputBytes ||
      transcript.length > 200
    ) {
      processRun.kill();
      socket.destroy(new Error("QMP output exceeded bound"));
      return;
    }
    while (pending.includes("\n")) {
      const cut = pending.indexOf("\n"),
        line = pending.slice(0, cut);
      pending = pending.slice(cut + 1);
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        socket.destroy(new Error("Malformed QMP JSON"));
        return;
      }
      transcript.push({ direction: "received", value });
      if (value.QMP) greeting(value);
      const receiver = waiting.get(value.id);
      if (receiver) {
        waiting.delete(value.id);
        if (value.error)
          receiver.reject(new Error(JSON.stringify(value.error)));
        else receiver.accept(value.return);
      }
    }
  });
  const bound = async (promise) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("QMP deadline")), 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  await bound(ready);
  return {
    close: () => socket.destroy(),
    command: async (execute, args) => {
      const id = ++nextId;
      const value = { execute, ...(args ? { arguments: args } : {}), id };
      const response = new Promise((accept, reject) =>
        waiting.set(id, { accept, reject }),
      );
      transcript.push({ direction: "sent", value });
      socket.write(JSON.stringify(value) + "\n");
      return bound(response);
    },
  };
}

export function auditVmLifecycle(report, expected, serial, transcript) {
  validateVmBinding(expected.binding);
  assert.equal(report.schemaVersion, "orch-c2-vm-lifecycle.v1");
  assert.deepEqual(report.binding, expected.binding);
  assert.equal(report.collectorSha256, expected.collectorSha256);
  assert.equal(report.preparationSha256, expected.preparationSha256);
  assert.equal(report.status, "OBSERVED");
  assert.equal(report.hostQualification, "NOT_READY");
  assert.equal(report.controllerDispatched, false);
  assert.equal(report.completionEligible, false);
  assert.deepEqual(report.limits, VM_LIMITS);
  assert.equal(report.launcher.platform, "linux");
  assert.equal(report.launcher.nodeVersion, "v24.18.0");
  assert.equal(report.launcher.uid, 1000);
  assert.equal(report.launcher.kernel, expected.launcherKernel);
  assert.equal(report.launcher.wsl, true);
  assert.deepEqual(report.inputs, expected.inputs);
  assert.equal(report.providerBefore, expected.providerInventorySha256);
  assert.equal(report.providerAfter, report.providerBefore);
  assert.equal(report.imageBefore, expected.inputs.image.sha256);
  assert.equal(report.imageAfter, report.imageBefore);
  assert.equal(report.packageStatusBefore, expected.packageStatusSha256);
  assert.equal(report.packageStatusAfter, report.packageStatusBefore);
  assert.equal(report.sentinelAfter, report.sentinelBefore);
  assert.equal(report.sentinelBefore, sha256(expected.binding.nonce));
  const argv = [
    expected.inputs.launchers[0].path,
    ...vmArguments(expected.root, report.directory, expected.binding),
  ];
  assert.deepEqual(report.process.argv, argv);
  assert.equal(report.proc.executable, expected.inputs.launchers[0].path);
  assert.deepEqual(report.proc.argv, argv);
  assert(Number.isSafeInteger(report.process.pid) && report.process.pid > 1);
  assert.match(report.proc.status, /^Uid:\s+1000\s+1000\s+1000\s+1000$/m);
  assert.match(report.proc.status, /^CapEff:\s+0+$/m);
  assert.match(report.proc.status, /^NoNewPrivs:\s+1$/m);
  assert.match(report.proc.status, /^Seccomp:\s+2$/m);
  assert.match(
    report.proc.status,
    new RegExp(`^Pid:\\s+${report.process.pid}$`, "m"),
  );
  assert.equal(report.process.exitCode, 0);
  assert.equal(report.process.signal, null);
  assert.equal(report.process.failure, null);
  assert(
    report.process.durationMs > 0 &&
      report.process.durationMs <= VM_LIMITS.timeoutMs,
  );
  assert.equal(report.cleanup.processAbsent, true);
  assert.equal(report.cleanup.directoryAbsent, true);
  assert.equal(report.cleanup.error, null);
  assert.equal(report.serialSha256, sha256(serial));
  assert.equal(report.qmpSha256, sha256(JSON.stringify(transcript) + "\n"));
  assert.deepEqual(report.guest, parseGuest(serial, expected.binding));
  const commands = [
    "qmp_capabilities",
    "query-name",
    "query-uuid",
    "query-kvm",
    "query-status",
    "query-memory-size-summary",
    "query-cpus-fast",
    "query-block",
    "query-chardev",
    "query-pci",
    "human-monitor-command",
    "cont",
    "quit",
  ];
  assert.deepEqual(
    transcript
      .filter((entry) => entry.direction === "sent")
      .map((entry) => entry.value),
    commands.map((execute, index) => ({
      execute,
      ...(execute === "human-monitor-command"
        ? { arguments: { "command-line": "info network" } }
        : {}),
      id: index + 1,
    })),
  );
  const response = (name) => {
    const sent = transcript.filter(
      (entry) => entry.direction === "sent" && entry.value.execute === name,
    );
    assert.equal(sent.length, 1, `Missing/duplicate QMP ${name}`);
    const replies = transcript.filter(
      (entry) =>
        entry.direction === "received" && entry.value.id === sent[0].value.id,
    );
    assert.equal(replies.length, 1);
    assert(!replies[0].value.error);
    return replies[0].value.return;
  };
  assert.equal(
    response("query-name").name,
    `orch-c2-${expected.binding.runId}`,
  );
  assert.equal(response("query-uuid").UUID, expected.binding.runId);
  assert.deepEqual(response("query-kvm"), { enabled: false, present: true });
  assert.equal(response("query-status").status, "prelaunch");
  assert.equal(
    response("query-memory-size-summary")["base-memory"],
    VM_LIMITS.memoryMiB * 1024 * 1024,
  );
  assert.equal(response("query-cpus-fast").length, VM_LIMITS.cpus);
  assert.equal(response("human-monitor-command").trim(), "");
  const block = response("query-block");
  assert.equal(block.length, 2);
  assert.equal(block[0].inserted.file, `${report.directory}/overlay.qcow2`);
  assert.equal(block[0].inserted["backing_file"], expected.inputs.image.path);
  assert.equal(block[1].inserted.file, `${report.directory}/seed.iso`);
  assert.equal(block[1].inserted.ro, true);
  assert.deepEqual(
    response("query-chardev")
      .map((item) => ({ filename: item.filename, label: item.label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [
      {
        filename: `unix:${report.directory}/qmp.sock,server=on`,
        label: "compat_monitor0",
      },
      { filename: "stdio", label: "serial0" },
    ],
  );
  const pci = response("query-pci");
  assert.equal(pci.length, 1);
  assert(pci[0].devices.length > 0 && pci[0].devices.length < 16);
  for (const device of pci[0].devices) {
    assert.equal(typeof device.class_info.class, "number");
    assert.notEqual(
      device.class_info.class >> 8,
      2,
      "Unexpected PCI network device.",
    );
    assert(!device.pci_bridge, "Unexpected extra PCI bus.");
  }
  response("qmp_capabilities");
  response("cont");
  response("quit");
  return {
    status: "PASS",
    guestPlatform: "linux",
    hostQualification: "NOT_READY",
    controllerDispatched: false,
    completionEligible: false,
  };
}

export async function collectVmLifecycle(expected, output) {
  assert.equal(process.platform, "linux");
  assert.equal(process.version, "v24.18.0");
  assert.equal(process.getuid(), 1000);
  validateVmBinding(expected.binding);
  safePath(expected.root);
  safePath(output);
  assert.equal(posix.dirname(output), expected.root);
  assert.equal(await realpath(expected.root), expected.root);
  assert.equal(await hashFile(import.meta.filename), expected.collectorSha256);
  assert.equal(
    await hashFile(`${expected.root}/preparation/preparation.json`),
    expected.preparationSha256,
  );
  await mkdir(output, { mode: 0o700 });
  const report = {
    schemaVersion: "orch-c2-vm-lifecycle.v1",
    binding: expected.binding,
    collectorSha256: expected.collectorSha256,
    preparationSha256: expected.preparationSha256,
    status: "ERROR",
    hostQualification: "NOT_READY",
    controllerDispatched: false,
    completionEligible: false,
    limits: VM_LIMITS,
    inputs: expected.inputs,
    launcher: {
      platform: process.platform,
      nodeVersion: process.version,
      uid: process.getuid(),
      kernel: release(),
      wsl: /microsoft|wsl/i.test(release()),
    },
  };
  let processRun,
    qmp,
    ownerBytes,
    transcript = [],
    directory;
  try {
    for (const pin of expected.inputs.launchers)
      await verifyPinnedFile(pin, true);
    await verifyPinnedFile(expected.inputs.image);
    for (const pin of expected.inputs.firmware) await verifyPinnedFile(pin);
    report.providerBefore = sha256(
      JSON.stringify(await providerInventory(`${expected.root}/provider`)) +
        "\n",
    );
    assert.equal(report.providerBefore, expected.providerInventorySha256);
    report.imageBefore = await hashFile(expected.inputs.image.path);
    report.packageStatusBefore = await hashFile("/var/lib/dpkg/status");
    assert.equal(report.packageStatusBefore, expected.packageStatusSha256);
    const sentinel = `${output}/outside-sentinel.txt`;
    await writeFile(sentinel, expected.binding.nonce, { flag: "wx" });
    report.sentinelBefore = await hashFile(sentinel);
    directory = await mkdtemp(`${expected.root}/guest-`);
    report.directory = directory;
    ownerBytes =
      JSON.stringify({ binding: expected.binding, directory }) + "\n";
    await writeFile(`${directory}/owner.json`, ownerBytes, { flag: "wx" });
    const config = {
      users: [],
      ssh_genkeytypes: [],
      allow_public_ssh_keys: false,
      network: { config: "disabled" },
      bootcmd: [["python3", "-c", guestProgram(expected.binding)]],
    };
    const seed = {
      "user-data": "#cloud-config\n" + JSON.stringify(config) + "\n",
      "meta-data":
        JSON.stringify({
          "instance-id": expected.binding.runId,
          "local-hostname": "orch-c2",
        }) + "\n",
      "network-config": JSON.stringify({ version: 2, ethernets: {} }) + "\n",
    };
    for (const [name, bytes] of Object.entries(seed)) {
      await writeFile(`${directory}/${name}`, bytes, { flag: "wx" });
      await writeFile(`${output}/${name}`, bytes, { flag: "wx" });
    }
    const env = {
      PATH: "/usr/bin:/bin",
      HOME: directory,
      LANG: "C",
      LC_ALL: "C",
      LD_LIBRARY_PATH: `${expected.root}/provider/usr/lib/x86_64-linux-gnu`,
      QEMU_MODULE_DIR: `${expected.root}/provider/usr/lib/x86_64-linux-gnu/qemu`,
    };
    const helper = async (name, executable, args) => {
      const result = await spawnBounded(
        executable,
        args,
        { cwd: directory, env },
        30_000,
      ).done;
      await writeFile(
        `${output}/${name}.json`,
        JSON.stringify(result, null, 2) + "\n",
      );
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.failure, null);
      return result;
    };
    await helper("overlay", expected.inputs.launchers[1].path, [
      "create",
      "-f",
      "qcow2",
      "-F",
      "qcow2",
      "-b",
      expected.inputs.image.path,
      `${directory}/overlay.qcow2`,
    ]);
    await helper("seed", expected.inputs.launchers[2].path, [
      "-output",
      `${directory}/seed.iso`,
      "-volid",
      "cidata",
      "-joliet",
      "-rock",
      `${directory}/user-data`,
      `${directory}/meta-data`,
      `${directory}/network-config`,
    ]);
    report.seedSha256 = await hashFile(`${directory}/seed.iso`);
    const args = vmArguments(expected.root, directory, expected.binding);
    processRun = spawnBounded(
      expected.inputs.launchers[0].path,
      args,
      { cwd: directory, env },
      VM_LIMITS.timeoutMs,
    );
    qmp = await openQmp(`${directory}/qmp.sock`, processRun, transcript);
    await qmp.command("qmp_capabilities");
    report.proc = {
      executable: await realpath(`/proc/${processRun.child.pid}/exe`),
      argv: (await readFile(`/proc/${processRun.child.pid}/cmdline`, "utf8"))
        .split("\0")
        .filter(Boolean),
      status: await readFile(`/proc/${processRun.child.pid}/status`, "utf8"),
    };
    for (const command of [
      "query-name",
      "query-uuid",
      "query-kvm",
      "query-status",
      "query-memory-size-summary",
      "query-cpus-fast",
      "query-block",
      "query-chardev",
      "query-pci",
    ])
      await qmp.command(command);
    await qmp.command("human-monitor-command", {
      "command-line": "info network",
    });
    await qmp.command("cont");
    const started = performance.now();
    while (!/^ORCH_C2_GUEST=\{[^\r\n]+\}\r?$/m.test(processRun.serial())) {
      assert(
        processRun.child.exitCode === null,
        "Guest exited without observation",
      );
      assert(
        performance.now() - started < VM_LIMITS.timeoutMs,
        "Guest observation timed out",
      );
      await writeFile(`${output}/serial.log`, processRun.serial());
      await writeFile(`${output}/qmp.json`, JSON.stringify(transcript) + "\n");
      await delay(500);
    }
    report.guest = parseGuest(processRun.serial(), expected.binding);
    await qmp.command("quit");
    report.process = await processRun.done;
    assert.equal(report.process.exitCode, 0);
    assert.equal(report.process.failure, null);
    report.imageAfter = await hashFile(expected.inputs.image.path);
    report.providerAfter = sha256(
      JSON.stringify(await providerInventory(`${expected.root}/provider`)) +
        "\n",
    );
    for (const pin of [
      ...expected.inputs.launchers,
      ...expected.inputs.firmware,
    ])
      await verifyPinnedFile(pin);
    report.packageStatusAfter = await hashFile("/var/lib/dpkg/status");
    report.sentinelAfter = await hashFile(sentinel);
    report.status = "OBSERVED";
  } catch (error) {
    report.error = error.message;
  } finally {
    qmp?.close();
    if (processRun && !report.process) {
      processRun.kill();
      report.process = await processRun.done;
    }
    let processAbsent = true;
    if (processRun?.child.pid) {
      try {
        process.kill(processRun.child.pid, 0);
        processAbsent = false;
      } catch (error) {
        assert.equal(error.code, "ESRCH");
      }
    }
    report.cleanup = { processAbsent, directoryAbsent: false, error: null };
    if (directory && processAbsent) {
      try {
        await removeOwnedGuest(directory, expected.root, ownerBytes);
        report.cleanup.directoryAbsent = true;
      } catch (error) {
        report.cleanup.error = error.message;
      }
    }
    const serial = report.process?.stdout ?? "";
    await writeFile(`${output}/serial.log`, serial);
    await writeFile(`${output}/qemu.stderr`, report.process?.stderr ?? "");
    const qmpBytes = JSON.stringify(transcript) + "\n";
    await writeFile(`${output}/qmp.json`, qmpBytes);
    report.serialSha256 = sha256(serial);
    report.qmpSha256 = sha256(qmpBytes);
    if (report.process) {
      delete report.process.stdout;
      delete report.process.stderr;
    }
    await writeFile(
      `${output}/lifecycle.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  auditVmLifecycle(
    report,
    expected,
    await readFile(`${output}/serial.log`, "utf8"),
    transcript,
  );
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(
    process.argv.length,
    4,
    "Expected trusted outer expectation file and fresh output.",
  );
  const expected = JSON.parse(await readFile(process.argv[2], "utf8"));
  try {
    const report = await collectVmLifecycle(expected, process.argv[3]);
    process.stdout.write(
      JSON.stringify({
        status: report.status,
        directory: report.directory,
        hostQualification: report.hostQualification,
        completionEligible: false,
      }) + "\n",
    );
  } catch (error) {
    process.stderr.write(error.stack + "\n");
    process.exitCode = 1;
  }
}
