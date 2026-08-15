import { spawn } from "node:child_process";
import { mkdir, open, readFile, symlink, writeFile } from "node:fs/promises";
import net from "node:net";

const mode = process.argv[2];
const evidence =
  process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR ?? "/evidence/command";
await mkdir(evidence, { recursive: true });

async function denied(operation) {
  try {
    await operation();
    return false;
  } catch {
    return true;
  }
}

function connectionDenied(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(true);
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function pidLimitEnforced() {
  const attempts = Array.from({ length: 400 }, () => {
    const child = spawn("sleep", ["10"], { stdio: "ignore" });
    const closed = new Promise((resolve) => child.once("close", resolve));
    return new Promise((resolve) => {
      child.once("spawn", () => resolve({ child, closed, denied: false }));
      child.once("error", () => resolve({ child, closed, denied: true }));
    });
  });
  const outcomes = await Promise.all(attempts);
  const spawned = outcomes.filter((entry) => !entry.denied);
  for (const entry of spawned) entry.child.kill("SIGKILL");
  await Promise.all(spawned.map((entry) => entry.closed));
  return outcomes.some((entry) => entry.denied);
}

if (mode === "boundary") {
  const canary = process.env.LOOP_TEST_CANARY;
  const target = process.env.LOOP_TEST_TARGET;
  const state = process.env.LOOP_TEST_STATE;
  if (!canary || !target || !state)
    throw new Error("Boundary paths are required.");
  const status = await readFile("/proc/self/status", "utf8");
  const results = {
    uidNonRoot:
      typeof process.getuid === "function" && process.getuid() === 65532,
    effectiveCapabilitiesDropped: /^CapEff:\s+0+$/m.test(status),
    noNewPrivileges: /^NoNewPrivs:\s+1$/m.test(status),
    rootFilesystemReadOnly: await denied(() =>
      writeFile("/rootfs-canary", "escape"),
    ),
    canaryReadDenied: await denied(() => readFile(canary)),
    sourceWriteDenied: await denied(() =>
      writeFile("/source/package.json", "escape"),
    ),
    targetWriteDenied: await denied(() => writeFile(target, "escape")),
    stateWriteDenied: await denied(() => writeFile(state, "escape")),
    homeReadDenied: await denied(() =>
      readFile("/home/duncan/.codex/auth.json"),
    ),
    dockerSocketDenied: await denied(() => readFile("/var/run/docker.sock")),
    storeWriteDenied: await denied(() =>
      writeFile("/pnpm-store/v11/escape", "escape"),
    ),
    localNetworkDenied: await connectionDenied("127.0.0.1", 43871),
    externalNetworkDenied: await connectionDenied("1.1.1.1", 53),
    symlinkReadDenied: false,
    pidsLimitConfigured:
      (await readFile("/sys/fs/cgroup/pids.max", "utf8")).trim() === "256",
    pidsLimitEnforced: false,
  };
  await symlink(canary, "canary-link");
  results.symlinkReadDenied = await denied(() => readFile("canary-link"));
  results.pidsLimitEnforced = await pidLimitEnforced();
  await writeFile("/evidence/outside-declared-root.json", "{}\n");
  if (Object.values(results).some((value) => value !== true)) {
    process.stderr.write(`${JSON.stringify(results)}\n`);
    process.exit(1);
  }
  await writeFile(
    `${evidence}/boundary.json`,
    `${JSON.stringify(results, null, 2)}\n`,
  );
  process.stdout.write("Boundary attempts were denied.\n");
} else if (mode === "artifact-link") {
  await symlink("/source/package.json", `${evidence}/escaped-link`);
  process.stdout.write("Created hostile artifact link.\n");
} else if (mode === "artifact-quota") {
  const oversized = await open(`${evidence}/oversized-sparse-artifact`, "w");
  try {
    await oversized.truncate(268_435_457);
  } finally {
    await oversized.close();
  }
  process.stdout.write("Created oversized sparse artifact.\n");
} else if (mode === "output-flood") {
  const block = "x".repeat(16_384);
  for (let index = 0; index < 64; index += 1)
    process.stdout.write(`${block}\n`);
} else if (mode === "hang") {
  const child = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
    {
      detached: true,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  await writeFile(
    `${evidence}/child.json`,
    `${JSON.stringify({ pid: child.pid })}\n`,
  );
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1_000);
} else if (mode === "pid-flood") {
  const enforced = await pidLimitEnforced();
  await writeFile(`${evidence}/pids.json`, `${JSON.stringify({ enforced })}\n`);
  if (!enforced) process.exit(1);
} else {
  throw new Error(`Unknown adversarial mode ${mode}.`);
}
