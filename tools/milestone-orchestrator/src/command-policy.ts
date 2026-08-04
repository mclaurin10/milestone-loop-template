import { isAbsolute } from "node:path";

import type { VerificationCommand } from "./contracts.js";

const forbiddenPnpmCommands = new Set([
  "add",
  "config",
  "deploy",
  "dlx",
  "env",
  "exec",
  "import",
  "install",
  "link",
  "publish",
  "rebuild",
  "remove",
  "root",
  "setup",
  "store",
  "unlink",
  "update",
]);

const readOnlyGitCommands = new Set([
  "diff",
  "grep",
  "log",
  "merge-base",
  "rev-list",
  "rev-parse",
  "show",
  "status",
]);

function unsafeArgument(argument: string): boolean {
  const normalized = argument.replaceAll("\\", "/");
  return (
    /[\r\n\0]/.test(argument) ||
    isAbsolute(argument) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..") ||
    /^(?:https?|file):\/\//i.test(normalized)
  );
}

export function verificationCommandSafetyError(
  command: VerificationCommand,
): string | null {
  if (command.args.length === 0)
    return `Verification command ${command.id} has no argv target.`;
  if (command.args.some(unsafeArgument))
    return `Verification command ${command.id} contains an absolute, traversal, URL, control-character, or external argument.`;
  const first = command.args[0] ?? "";
  if (command.executable === "pnpm") {
    if (
      !/^[a-z0-9][a-z0-9:_-]*$/i.test(first) ||
      first.startsWith("-") ||
      forbiddenPnpmCommands.has(first.toLowerCase())
    )
      return `Verification command ${command.id} does not invoke a repository-owned pnpm script.`;
    return null;
  }
  if (command.executable === "node") {
    const normalized = first.replaceAll("\\", "/");
    if (
      (!normalized.startsWith("tools/") &&
        !normalized.startsWith("scripts/")) ||
      !/\.(?:m?js|cjs)$/.test(normalized)
    )
      return `Verification command ${command.id} must invoke a repository-relative tools/ or scripts/ JavaScript file.`;
    return null;
  }
  if (!readOnlyGitCommands.has(first))
    return `Verification command ${command.id} uses non-read-only git subcommand ${first}.`;
  return null;
}

export function assertSafeVerificationCommand(
  command: VerificationCommand,
): void {
  const error = verificationCommandSafetyError(command);
  if (error) throw new Error(error);
}
