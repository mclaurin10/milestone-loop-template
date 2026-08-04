#!/usr/bin/env node
const id = process.argv[2] ?? "unknown-check";
process.stderr.write(
  `[placeholder] ${id}: this repository ships a placeholder for a project-owned check.\n` +
    `Replace the "${id}" package script with your project's real evidence-producing command.\n` +
    `The command must write a result.json receipt into LOOP_VERIFY_COMMAND_ARTIFACT_DIR;\n` +
    `see CONTRACT.md ("Focused verification commands") and tools/evidence.mjs.\n`,
);
process.exit(1);
