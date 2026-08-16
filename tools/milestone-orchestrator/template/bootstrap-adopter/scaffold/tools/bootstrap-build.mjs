import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(repositoryRoot, "app");
const outputRoot = resolve(repositoryRoot, "dist");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const name of ["index.html", "main.mjs", "worker.mjs", "kernel.mjs"])
  await cp(resolve(sourceRoot, name), resolve(outputRoot, name), {
    errorOnExist: true,
    force: false,
  });
