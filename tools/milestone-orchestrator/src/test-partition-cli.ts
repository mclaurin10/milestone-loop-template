import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  runPartitionOmissionMutationCli,
  runOwnedPartitionCli,
  runPartitionShadowCli,
} from "./test-partitions.js";

export async function runTestPartitionCli(
  values: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const [mode, ...rest] = values;
  if (mode === "run" && rest.length === 1)
    return runOwnedPartitionCli(rest[0]!);
  if (mode === "shadow" && rest.length === 0) return runPartitionShadowCli();
  if (mode === "omission-mutation" && rest.length === 0)
    return runPartitionOmissionMutationCli();
  process.stderr.write(
    "Usage: test-partition-cli.ts run <owner> | test-partition-cli.ts shadow | test-partition-cli.ts omission-mutation\n",
  );
  return 64;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url)
  process.exitCode = await runTestPartitionCli();
