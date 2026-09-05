import { VERIFICATION_TIERS, type VerificationTier } from "./contracts.js";
import { canonicalJson } from "./package-graph.js";
import type { VerificationTierPlan } from "./verification-tier.js";

export const SCHEDULE_PROJECTION_SCHEMA_VERSION =
  "verification-schedule-projection.v1" as const;

/** Command definitions in execution order, without candidate or policy metadata. */
export interface VerificationScheduleProjection {
  readonly schemaVersion: typeof SCHEDULE_PROJECTION_SCHEMA_VERSION;
  readonly tier: VerificationTier;
  /** Focused commands only; the separately identified exact closure is excluded. */
  readonly commandCount: number;
  readonly exactVerificationIncluded: boolean;
  readonly actualCheckIds: readonly string[];
  readonly commands: readonly {
    readonly id: string;
    readonly argv: readonly string[];
    readonly expectedArtifactKinds: readonly string[];
  }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return (
    actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index])
  );
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}

export function assertVerificationScheduleProjection(
  value: unknown,
): VerificationScheduleProjection {
  if (
    !record(value) ||
    !keys(value, [
      "schemaVersion",
      "tier",
      "commandCount",
      "exactVerificationIncluded",
      "actualCheckIds",
      "commands",
    ]) ||
    value["schemaVersion"] !== SCHEDULE_PROJECTION_SCHEMA_VERSION ||
    !VERIFICATION_TIERS.includes(value["tier"] as VerificationTier) ||
    !Number.isSafeInteger(value["commandCount"]) ||
    (value["commandCount"] as number) < 0 ||
    typeof value["exactVerificationIncluded"] !== "boolean" ||
    !strings(value["actualCheckIds"]) ||
    new Set(value["actualCheckIds"]).size !== value["actualCheckIds"].length ||
    !Array.isArray(value["commands"])
  )
    throw new Error("Invalid verification schedule projection contract.");

  for (const command of value["commands"] as unknown[]) {
    if (
      !record(command) ||
      !keys(command, ["id", "argv", "expectedArtifactKinds"]) ||
      typeof command["id"] !== "string" ||
      command["id"].trim().length === 0 ||
      !strings(command["argv"]) ||
      command["argv"].length < 2 ||
      !["pnpm", "node", "git"].includes(command["argv"][0] ?? "") ||
      !strings(command["expectedArtifactKinds"]) ||
      new Set(command["expectedArtifactKinds"]).size !==
        command["expectedArtifactKinds"].length
    )
      throw new Error("Invalid verification schedule command definition.");
  }
  const projection = value as unknown as VerificationScheduleProjection;
  const exactRequired =
    projection.tier === "milestone" || projection.tier === "periodic";
  const exactCommands = projection.commands.filter(
    (command) => command.id === "exact-readiness",
  );
  if (
    projection.commands.length !== projection.actualCheckIds.length ||
    projection.commands.some(
      (command, index) => command.id !== projection.actualCheckIds[index],
    ) ||
    projection.exactVerificationIncluded !== exactRequired ||
    exactCommands.length !== Number(exactRequired) ||
    projection.commandCount !==
      projection.commands.length - exactCommands.length ||
    (projection.tier === "periodic" && projection.commandCount !== 0)
  )
    throw new Error(
      "Verification schedule IDs, count, or closure inclusion are inconsistent.",
    );
  const exact = exactCommands[0];
  if (
    exact &&
    (projection.actualCheckIds.at(-1) !== "exact-readiness" ||
      exact.argv.length !== 2 ||
      exact.argv[0] !== "pnpm" ||
      exact.argv[1] !== "verify" ||
      exact.expectedArtifactKinds.length !== 0)
  )
    throw new Error(
      "Verification schedule closure must be the final literal no-argument pnpm verify.",
    );
  if (
    projection.commands.some(
      (command) =>
        command.id !== "exact-readiness" &&
        command.expectedArtifactKinds.length === 0,
    )
  )
    throw new Error(
      "Verification schedule focused commands require artifact kinds.",
    );
  return projection;
}

export function projectVerificationSchedule(input: {
  readonly tier: VerificationTier;
  readonly plan: Pick<VerificationTierPlan, "commands" | "actualCheckIds">;
  readonly exactVerificationArgv: readonly string[];
}): VerificationScheduleProjection {
  const focusedIds = input.plan.actualCheckIds.filter(
    (id) => id !== "exact-readiness",
  );
  if (
    focusedIds.length !== input.plan.commands.length ||
    input.plan.commands.some(
      (command, index) => command.id !== focusedIds[index],
    )
  )
    throw new Error(
      "Production tier plan command order does not match its actual check IDs.",
    );
  const commands = input.plan.commands.map((command) => ({
    id: command.id,
    argv: [...command.argv],
    expectedArtifactKinds: [...command.expectedArtifactKinds],
  }));
  const exactVerificationIncluded =
    input.plan.actualCheckIds.includes("exact-readiness");
  if (exactVerificationIncluded)
    commands.push({
      id: "exact-readiness",
      argv: [...input.exactVerificationArgv],
      expectedArtifactKinds: [],
    });
  return assertVerificationScheduleProjection({
    schemaVersion: SCHEDULE_PROJECTION_SCHEMA_VERSION,
    tier: input.tier,
    commandCount: input.plan.commands.length,
    exactVerificationIncluded,
    actualCheckIds: [...input.plan.actualCheckIds],
    commands,
  });
}

export function canonicalVerificationScheduleProjection(
  value: unknown,
): string {
  return canonicalJson(assertVerificationScheduleProjection(value));
}
