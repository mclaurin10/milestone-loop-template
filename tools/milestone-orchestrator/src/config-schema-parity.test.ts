import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfigForInspection } from "./config.js";
import {
  CONFIG_SCHEMA_VERSION,
  REQUIRED_PROTECTED_PATHS,
} from "./contracts.js";
import { validConfig } from "../test/fixtures.js";
import { validateJsonSchema202012 } from "../test/json-schema-2020-12.js";

type JsonRecord = Record<string, unknown>;

interface ConfigParityCase {
  readonly id: string;
  readonly expected: boolean;
  readonly value: unknown;
}

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const schemaRoot = resolve(
  repositoryRoot,
  "tools/milestone-orchestrator/schemas",
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
}

function atPath(value: unknown, path: readonly string[]): JsonRecord {
  let current = value;
  for (const [index, segment] of path.entries())
    current = record(current, path.slice(0, index).join("."))[segment];
  return record(current, path.join(".") || "root");
}

function mutateObject(
  value: unknown,
  path: readonly string[],
  mutation: (target: JsonRecord) => void,
): unknown {
  const cloned = structuredClone(value);
  mutation(atPath(cloned, path));
  return cloned;
}

function setValue(
  value: unknown,
  path: readonly string[],
  key: string,
  replacement: unknown,
): unknown {
  return mutateObject(value, path, (target) => {
    target[key] = replacement;
  });
}

function removeValue(
  value: unknown,
  path: readonly string[],
  key: string,
): unknown {
  return mutateObject(value, path, (target) => {
    delete target[key];
  });
}

function schemaObjectAt(schema: unknown, path: readonly string[]): JsonRecord {
  let current: unknown = schema;
  for (const segment of path)
    current = record(current, `schema ${path.join(".")}`)[segment];
  return record(current, `schema ${path.join(".")}`);
}

function expectedClosedBoundary(schema: JsonRecord, value: JsonRecord): void {
  expect(schema["additionalProperties"]).toBe(false);
  expect(
    Object.keys(record(schema["properties"], "schema properties")).sort(),
  ).toEqual(Object.keys(value).sort());
  expect([...(schema["required"] as readonly string[])].sort()).toEqual(
    Object.keys(value).sort(),
  );
}

const configSchema = readJson(
  resolve(schemaRoot, "orchestrator-config.schema.json"),
);
const modelPolicySchema = readJson(
  resolve(schemaRoot, "model-policy.schema.json"),
);
const sourceDefault = readJson(
  resolve(repositoryRoot, "tools/milestone-orchestrator/config/default.json"),
);
const sourceTemplate = readJson(
  resolve(
    repositoryRoot,
    "tools/milestone-orchestrator/config/default.template.json",
  ),
);
const workedExample = readJson(
  resolve(repositoryRoot, "examples/ski-tycoon/default.json"),
);
const base = validConfig();
const validOverride = {
  role: "lightweight-reporting",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  reason: "A bounded reporting task benefits from the stronger model.",
};

const withValidOverride = setValue(base, ["agentPolicy"], "overrides", [
  validOverride,
]);
const withPinnedPodman = setValue(
  setValue(
    base,
    ["candidateExecution", "trustedContainer"],
    "runtime",
    "podman",
  ),
  ["candidateExecution", "trustedContainer"],
  "imageDigest",
  `sha256:${"a".repeat(64)}`,
);

const configCases: ConfigParityCase[] = [
  { id: "accepts-fixture-current", expected: true, value: base },
  { id: "accepts-source-default", expected: true, value: sourceDefault },
  { id: "accepts-worked-example", expected: true, value: workedExample },
  {
    id: "accepts-unsafe-local-diagnostic-opt-in",
    expected: true,
    value: setValue(
      base,
      ["candidateExecution"],
      "mode",
      "unsafe-local-diagnostic",
    ),
  },
  {
    id: "accepts-pinned-podman-shape",
    expected: true,
    value: withPinnedPodman,
  },
  {
    id: "accepts-zero-retained-runs",
    expected: true,
    value: setValue(base, ["evidenceRetention"], "keepRecentRuns", 0),
  },
  {
    id: "accepts-valid-category-regex",
    expected: true,
    value: setValue(base, ["project", "verticalSpine"], "categoryPatterns", [
      "^(network|resource)$",
    ]),
  },
  {
    id: "accepts-one-valid-role-override",
    expected: true,
    value: withValidOverride,
  },
  {
    id: "rejects-placeholder-template-before-substitution",
    expected: false,
    value: sourceTemplate,
  },
];

for (const path of [
  [] as const,
  ["project"] as const,
  ["project", "verticalSpine"] as const,
  ["candidateExecution"] as const,
  ["candidateExecution", "trustedContainer"] as const,
  ["evidenceRetention"] as const,
  ["agentPolicy"] as const,
  ["agentPolicy", "sdk"] as const,
  ["agentPolicy", "execution"] as const,
  ["agentPolicy", "roles"] as const,
  ["agentPolicy", "roles", "planner"] as const,
  ["agentPolicy", "workerEscalation"] as const,
  ["limits"] as const,
]) {
  const key = path.length === 0 ? "targetBrnch" : "unexpected";
  configCases.push({
    id: `rejects-unknown-${path.join("-") || "root"}`,
    expected: false,
    value: setValue(base, path, key, true),
  });
}

configCases.push(
  {
    id: "rejects-unknown-override-entry",
    expected: false,
    value: setValue(base, ["agentPolicy"], "overrides", [
      { ...validOverride, unexpected: true },
    ]),
  },
  {
    id: "rejects-missing-root-target-branch",
    expected: false,
    value: removeValue(base, [], "targetBranch"),
  },
  {
    id: "rejects-missing-project-name",
    expected: false,
    value: removeValue(base, ["project"], "name"),
  },
  {
    id: "rejects-missing-provider-mode",
    expected: false,
    value: removeValue(base, ["candidateExecution"], "mode"),
  },
  {
    id: "rejects-missing-reviewer-role",
    expected: false,
    value: removeValue(base, ["agentPolicy", "roles"], "reviewer"),
  },
  {
    id: "rejects-missing-command-limit",
    expected: false,
    value: removeValue(base, ["limits"], "commandMs"),
  },
  {
    id: "rejects-whitespace-project-name",
    expected: false,
    value: setValue(base, ["project"], "name", " \t "),
  },
  {
    id: "rejects-traversing-state-path",
    expected: false,
    value: setValue(base, [], "statePath", "../state.json"),
  },
  {
    id: "rejects-invalid-category-regex",
    expected: false,
    value: setValue(base, ["project", "verticalSpine"], "categoryPatterns", [
      "[",
    ]),
  },
  {
    id: "rejects-invalid-image-digest",
    expected: false,
    value: setValue(
      base,
      ["candidateExecution", "trustedContainer"],
      "imageDigest",
      "sha256:not-a-digest",
    ),
  },
  {
    id: "rejects-negative-retention-count",
    expected: false,
    value: setValue(base, ["evidenceRetention"], "keepRecentRuns", -1),
  },
  {
    id: "rejects-zero-command-limit",
    expected: false,
    value: setValue(base, ["limits"], "commandMs", 0),
  },
  {
    id: "rejects-duplicate-protected-path",
    expected: false,
    value: setValue(base, [], "protectedPaths", [
      ...base.protectedPaths,
      base.protectedPaths[0],
    ]),
  },
  {
    id: "rejects-wildcard-protected-path",
    expected: false,
    value: setValue(base, [], "protectedPaths", [
      ...base.protectedPaths,
      "tools/**",
    ]),
  },
  {
    id: "rejects-missing-mandatory-protected-path",
    expected: false,
    value: setValue(
      base,
      [],
      "protectedPaths",
      base.protectedPaths.filter((path) => path !== "scripts/verify.mjs"),
    ),
  },
  {
    id: "rejects-duplicate-override-role",
    expected: false,
    value: setValue(base, ["agentPolicy"], "overrides", [
      validOverride,
      { ...validOverride, reason: "A duplicate role must fail." },
    ]),
  },
  {
    id: "rejects-whitespace-override-reason",
    expected: false,
    value: setValue(base, ["agentPolicy"], "overrides", [
      { ...validOverride, reason: "   " },
    ]),
  },
  {
    id: "rejects-changed-required-role-default",
    expected: false,
    value: setValue(
      base,
      ["agentPolicy", "roles", "planner"],
      "reasoningEffort",
      "high",
    ),
  },
);

let runtimeRoot: string;

beforeAll(async () => {
  runtimeRoot = await mkdtemp(join(tmpdir(), "config-schema-parity-"));
});

afterAll(async () => {
  await rm(runtimeRoot, { recursive: true, force: true });
});

async function runtimeAccepts(testCase: ConfigParityCase): Promise<{
  readonly accepted: boolean;
  readonly diagnostic: string | null;
}> {
  const path = join(runtimeRoot, `${testCase.id}.json`);
  await writeFile(path, `${JSON.stringify(testCase.value, null, 2)}\n`, "utf8");
  try {
    await loadConfigForInspection(runtimeRoot, path);
    return { accepted: true, diagnostic: null };
  } catch (error) {
    return {
      accepted: false,
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

describe("orchestrator config runtime and JSON Schema parity", () => {
  it("uses closed object boundaries and the exact protected floor", () => {
    const config = record(configSchema, "config schema");
    const policy = record(modelPolicySchema, "model policy schema");
    const configValue = record(base, "config fixture");
    const policyValue = record(configValue["agentPolicy"], "agent policy");

    expect(config["$schema"]).toContain("2020-12");
    expect(config["$id"]).toContain(CONFIG_SCHEMA_VERSION);
    expect(
      schemaObjectAt(config, ["properties", "schemaVersion"])["const"],
    ).toBe(CONFIG_SCHEMA_VERSION);
    expect(schemaObjectAt(config, ["properties", "agentPolicy"])["$ref"]).toBe(
      policy["$id"],
    );

    for (const [schema, value] of [
      [config, configValue],
      [
        schemaObjectAt(config, ["properties", "project"]),
        record(configValue["project"], "project"),
      ],
      [
        schemaObjectAt(config, [
          "properties",
          "project",
          "properties",
          "verticalSpine",
        ]),
        record(
          record(configValue["project"], "project")["verticalSpine"],
          "vertical spine",
        ),
      ],
      [
        schemaObjectAt(config, ["properties", "candidateExecution"]),
        record(configValue["candidateExecution"], "candidate execution"),
      ],
      [
        schemaObjectAt(config, [
          "properties",
          "candidateExecution",
          "properties",
          "trustedContainer",
        ]),
        record(
          record(configValue["candidateExecution"], "candidate execution")[
            "trustedContainer"
          ],
          "trusted container",
        ),
      ],
      [
        schemaObjectAt(config, ["properties", "evidenceRetention"]),
        record(configValue["evidenceRetention"], "evidence retention"),
      ],
      [
        schemaObjectAt(config, ["properties", "limits"]),
        record(configValue["limits"], "limits"),
      ],
      [policy, policyValue],
      [
        schemaObjectAt(policy, ["properties", "sdk"]),
        record(policyValue["sdk"], "sdk"),
      ],
      [
        schemaObjectAt(policy, ["properties", "execution"]),
        record(policyValue["execution"], "execution"),
      ],
      [
        schemaObjectAt(policy, ["properties", "roles"]),
        record(policyValue["roles"], "roles"),
      ],
      [
        schemaObjectAt(policy, ["properties", "workerEscalation"]),
        record(policyValue["workerEscalation"], "worker escalation"),
      ],
      [
        schemaObjectAt(policy, ["properties", "overrides", "items"]),
        validOverride,
      ],
    ] as const)
      expectedClosedBoundary(schema, value);

    for (const assignment of ["solMax", "solXhigh", "terraMedium"])
      expectedClosedBoundary(schemaObjectAt(policy, ["$defs", assignment]), {
        model: "unused",
        reasoningEffort: "unused",
      });

    const protectedPaths = schemaObjectAt(config, [
      "properties",
      "protectedPaths",
    ]);
    const protectedFloor = (protectedPaths["allOf"] as readonly unknown[])
      .map((entry) => schemaObjectAt(entry, ["contains"])["const"])
      .sort();
    expect(protectedFloor).toEqual([...REQUIRED_PROTECTED_PATHS].sort());
  });

  it("fails closed on unsupported keywords and unresolved references", () => {
    expect(() =>
      validateJsonSchema202012(
        { ...record(configSchema, "config schema"), dependentSchemas: {} },
        base,
        [modelPolicySchema],
      ),
    ).toThrow(/Unsupported JSON Schema keyword dependentSchemas/);
    expect(() => validateJsonSchema202012(configSchema, base)).toThrow(
      /cannot resolve schema document/,
    );
  });

  it.each(configCases)("$id", async (testCase) => {
    const runtime = await runtimeAccepts(testCase);
    const schema = validateJsonSchema202012(configSchema, testCase.value, [
      modelPolicySchema,
    ]);
    expect(
      runtime.accepted,
      `${testCase.id} runtime diagnostic: ${runtime.diagnostic ?? "accepted"}`,
    ).toBe(testCase.expected);
    expect(
      schema.valid,
      `${testCase.id} schema diagnostic: ${schema.errors.join(" | ") || "accepted"}`,
    ).toBe(testCase.expected);
    expect(runtime.accepted, `${testCase.id} differential disposition`).toBe(
      schema.valid,
    );
  });
});
