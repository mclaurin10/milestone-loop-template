import { isDeepStrictEqual } from "node:util";

type JsonRecord = Record<string, unknown>;

export interface JsonSchemaValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

interface EvaluationContext {
  readonly registry: ReadonlyMap<string, JsonRecord>;
  readonly baseUri: string;
  readonly instancePath: string;
  readonly schemaPath: string;
}

const SUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "$comment",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "required",
  "properties",
  "additionalProperties",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "uniqueItems",
  "items",
  "prefixItems",
  "contains",
  "minContains",
  "maxContains",
]);

function record(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPath(path: string, token: string): string {
  return `${path}/${pointerToken(token)}`;
}

function schemaObject(value: unknown, label: string): JsonRecord {
  if (!record(value)) throw new Error(`${label} must be a schema object.`);
  return value;
}

function schemaArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function integerKeyword(
  schema: JsonRecord,
  keyword: string,
): number | undefined {
  const value = schema[keyword];
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error(`${keyword} must be a nonnegative safe integer.`);
  return Number(value);
}

function assertSupportedSchema(value: unknown, path: string): void {
  if (typeof value === "boolean") return;
  const schema = schemaObject(value, path);
  for (const keyword of Object.keys(schema))
    if (!SUPPORTED_KEYWORDS.has(keyword))
      throw new Error(`Unsupported JSON Schema keyword ${keyword} at ${path}.`);

  const definitions = schema["$defs"];
  if (definitions !== undefined) {
    const entries = schemaObject(definitions, `${path}/$defs`);
    for (const [name, definition] of Object.entries(entries))
      assertSupportedSchema(definition, childPath(`${path}/$defs`, name));
  }
  const properties = schema["properties"];
  if (properties !== undefined) {
    const entries = schemaObject(properties, `${path}/properties`);
    for (const [name, property] of Object.entries(entries))
      assertSupportedSchema(property, childPath(`${path}/properties`, name));
  }
  const additional = schema["additionalProperties"];
  if (additional !== undefined && typeof additional !== "boolean")
    assertSupportedSchema(additional, `${path}/additionalProperties`);
  const items = schema["items"];
  if (items !== undefined) assertSupportedSchema(items, `${path}/items`);
  const prefixItems = schema["prefixItems"];
  if (prefixItems !== undefined) {
    const members = schemaArray(prefixItems, `${path}/prefixItems`);
    if (members.length === 0)
      throw new Error(`${path}/prefixItems must not be empty.`);
    members.forEach((member, index) =>
      assertSupportedSchema(member, `${path}/prefixItems/${index}`),
    );
  }
  const contains = schema["contains"];
  if (contains !== undefined)
    assertSupportedSchema(contains, `${path}/contains`);
  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    const members = schema[keyword];
    if (members === undefined) continue;
    schemaArray(members, `${path}/${keyword}`).forEach((member, index) =>
      assertSupportedSchema(member, `${path}/${keyword}/${index}`),
    );
  }
  if (schema["not"] !== undefined)
    assertSupportedSchema(schema["not"], `${path}/not`);
  for (const keyword of ["if", "then", "else"] as const)
    if (schema[keyword] !== undefined)
      assertSupportedSchema(schema[keyword], `${path}/${keyword}`);
  if (
    (schema["then"] !== undefined || schema["else"] !== undefined) &&
    schema["if"] === undefined
  )
    throw new Error(`${path} uses then/else without if.`);
  if (
    (schema["minContains"] !== undefined ||
      schema["maxContains"] !== undefined) &&
    schema["contains"] === undefined
  )
    throw new Error(`${path} uses minContains/maxContains without contains.`);
}

function schemaId(schema: JsonRecord, label: string): string {
  const id = schema["$id"];
  if (typeof id !== "string" || !id)
    throw new Error(`${label} must declare a nonempty $id.`);
  try {
    return new URL(id).href;
  } catch {
    throw new Error(`${label} has an invalid absolute $id ${String(id)}.`);
  }
}

function schemaRegistry(
  root: JsonRecord,
  references: readonly unknown[],
): ReadonlyMap<string, JsonRecord> {
  const registry = new Map<string, JsonRecord>();
  for (const [index, candidate] of [root, ...references].entries()) {
    const schema = schemaObject(candidate, `schema document ${index}`);
    assertSupportedSchema(schema, `schema document ${index}`);
    const id = schemaId(schema, `schema document ${index}`);
    if (registry.has(id)) throw new Error(`Duplicate JSON Schema $id ${id}.`);
    registry.set(id, schema);
  }
  return registry;
}

function resolvePointer(document: JsonRecord, fragment: string): unknown {
  if (fragment === "" || fragment === "#") return document;
  const pointer = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!pointer.startsWith("/"))
    throw new Error(`Only JSON Pointer fragments are supported: ${fragment}.`);
  let current: unknown = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = decodeURIComponent(rawToken)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    if (!record(current) || !(token in current))
      throw new Error(`JSON Schema pointer ${fragment} does not resolve.`);
    current = current[token];
  }
  return current;
}

function resolveReference(
  reference: unknown,
  context: EvaluationContext,
): { readonly schema: unknown; readonly context: EvaluationContext } {
  if (typeof reference !== "string" || !reference)
    throw new Error(`${context.schemaPath}/$ref must be a nonempty string.`);
  const resolved = new URL(reference, context.baseUri);
  const fragment = resolved.hash;
  resolved.hash = "";
  const documentUri = resolved.href;
  const document = context.registry.get(documentUri);
  if (!document)
    throw new Error(
      `${context.schemaPath}/$ref cannot resolve schema document ${documentUri}.`,
    );
  return {
    schema: resolvePointer(document, fragment),
    context: {
      ...context,
      baseUri: documentUri,
      schemaPath: `${documentUri}${fragment}`,
    },
  };
}

function matchesType(instance: unknown, type: string): boolean {
  switch (type) {
    case "null":
      return instance === null;
    case "boolean":
      return typeof instance === "boolean";
    case "object":
      return record(instance);
    case "array":
      return Array.isArray(instance);
    case "number":
      return typeof instance === "number" && Number.isFinite(instance);
    case "integer":
      return typeof instance === "number" && Number.isInteger(instance);
    case "string":
      return typeof instance === "string";
    default:
      throw new Error(`Unsupported JSON Schema type ${type}.`);
  }
}

function schemaTypes(value: unknown, path: string): readonly string[] {
  if (typeof value === "string") return [value];
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string")
  )
    return value;
  throw new Error(`${path}/type must be a string or nonempty string array.`);
}

function evaluationError(
  context: EvaluationContext,
  keyword: string,
  message: string,
): string {
  return `${context.instancePath || "/"}: ${message} (${context.schemaPath}/${keyword})`;
}

function evaluate(
  schemaValue: unknown,
  instance: unknown,
  context: EvaluationContext,
): readonly string[] {
  if (schemaValue === true) return [];
  if (schemaValue === false)
    return [evaluationError(context, "false", "boolean schema rejected value")];
  const schema = schemaObject(schemaValue, context.schemaPath);
  const errors: string[] = [];

  if (schema["$ref"] !== undefined) {
    const resolved = resolveReference(schema["$ref"], context);
    errors.push(...evaluate(resolved.schema, instance, resolved.context));
  }

  const type = schema["type"];
  if (type !== undefined) {
    const types = schemaTypes(type, context.schemaPath);
    if (!types.some((candidate) => matchesType(instance, candidate))) {
      errors.push(
        evaluationError(context, "type", `expected ${types.join(" or ")}`),
      );
      return errors;
    }
  }

  if (
    schema["const"] !== undefined &&
    !isDeepStrictEqual(instance, schema["const"])
  )
    errors.push(evaluationError(context, "const", "value differs from const"));
  if (schema["enum"] !== undefined) {
    const values = schemaArray(schema["enum"], `${context.schemaPath}/enum`);
    if (!values.some((value) => isDeepStrictEqual(value, instance)))
      errors.push(evaluationError(context, "enum", "value is outside enum"));
  }

  const allOf = schema["allOf"];
  if (allOf !== undefined)
    schemaArray(allOf, `${context.schemaPath}/allOf`).forEach(
      (member, index) => {
        errors.push(
          ...evaluate(member, instance, {
            ...context,
            schemaPath: `${context.schemaPath}/allOf/${index}`,
          }),
        );
      },
    );
  const anyOf = schema["anyOf"];
  if (anyOf !== undefined) {
    const matches = schemaArray(anyOf, `${context.schemaPath}/anyOf`).filter(
      (member, index) =>
        evaluate(member, instance, {
          ...context,
          schemaPath: `${context.schemaPath}/anyOf/${index}`,
        }).length === 0,
    ).length;
    if (matches === 0)
      errors.push(evaluationError(context, "anyOf", "no branch matched"));
  }
  const oneOf = schema["oneOf"];
  if (oneOf !== undefined) {
    const matches = schemaArray(oneOf, `${context.schemaPath}/oneOf`).filter(
      (member, index) =>
        evaluate(member, instance, {
          ...context,
          schemaPath: `${context.schemaPath}/oneOf/${index}`,
        }).length === 0,
    ).length;
    if (matches !== 1)
      errors.push(
        evaluationError(
          context,
          "oneOf",
          `expected one matching branch, received ${matches}`,
        ),
      );
  }
  if (schema["not"] !== undefined) {
    const matched =
      evaluate(schema["not"], instance, {
        ...context,
        schemaPath: `${context.schemaPath}/not`,
      }).length === 0;
    if (matched)
      errors.push(evaluationError(context, "not", "negated schema matched"));
  }
  if (schema["if"] !== undefined) {
    const matched =
      evaluate(schema["if"], instance, {
        ...context,
        schemaPath: `${context.schemaPath}/if`,
      }).length === 0;
    const branch = matched ? schema["then"] : schema["else"];
    if (branch !== undefined)
      errors.push(
        ...evaluate(branch, instance, {
          ...context,
          schemaPath: `${context.schemaPath}/${matched ? "then" : "else"}`,
        }),
      );
  }

  if (typeof instance === "string") {
    const length = [...instance].length;
    const minimum = integerKeyword(schema, "minLength");
    const maximum = integerKeyword(schema, "maxLength");
    if (minimum !== undefined && length < minimum)
      errors.push(
        evaluationError(context, "minLength", `string length ${length} is low`),
      );
    if (maximum !== undefined && length > maximum)
      errors.push(
        evaluationError(
          context,
          "maxLength",
          `string length ${length} is high`,
        ),
      );
    const pattern = schema["pattern"];
    if (pattern !== undefined) {
      if (typeof pattern !== "string")
        throw new Error(`${context.schemaPath}/pattern must be a string.`);
      let expression: RegExp;
      try {
        expression = new RegExp(pattern, "u");
      } catch {
        throw new Error(
          `${context.schemaPath}/pattern is invalid: ${pattern}.`,
        );
      }
      if (!expression.test(instance))
        errors.push(
          evaluationError(
            context,
            "pattern",
            `string does not match ${pattern}`,
          ),
        );
    }
    const format = schema["format"];
    if (format !== undefined) {
      if (format !== "regex")
        throw new Error(
          `${context.schemaPath}/format ${String(format)} is unsupported.`,
        );
      try {
        new RegExp(instance, "i");
      } catch {
        errors.push(
          evaluationError(context, "format", "string is not a valid regex"),
        );
      }
    }
  }

  if (typeof instance === "number" && Number.isFinite(instance)) {
    const minimum = schema["minimum"];
    const maximum = schema["maximum"];
    if (minimum !== undefined) {
      if (typeof minimum !== "number" || !Number.isFinite(minimum))
        throw new Error(`${context.schemaPath}/minimum must be finite.`);
      if (instance < minimum)
        errors.push(evaluationError(context, "minimum", "number is too low"));
    }
    if (maximum !== undefined) {
      if (typeof maximum !== "number" || !Number.isFinite(maximum))
        throw new Error(`${context.schemaPath}/maximum must be finite.`);
      if (instance > maximum)
        errors.push(evaluationError(context, "maximum", "number is too high"));
    }
  }

  if (record(instance)) {
    const required = schema["required"];
    if (required !== undefined) {
      const keys = schemaArray(required, `${context.schemaPath}/required`);
      if (!keys.every((key) => typeof key === "string"))
        throw new Error(`${context.schemaPath}/required must contain strings.`);
      for (const key of keys)
        if (!((key as string) in instance))
          errors.push(
            evaluationError(
              {
                ...context,
                instancePath: childPath(context.instancePath, String(key)),
              },
              "required",
              "required property is missing",
            ),
          );
    }
    const propertiesValue = schema["properties"];
    const properties =
      propertiesValue === undefined
        ? {}
        : schemaObject(propertiesValue, `${context.schemaPath}/properties`);
    const additional = schema["additionalProperties"];
    for (const [key, value] of Object.entries(instance)) {
      const propertySchema = properties[key];
      const childContext = {
        ...context,
        instancePath: childPath(context.instancePath, key),
      };
      if (propertySchema !== undefined) {
        errors.push(
          ...evaluate(propertySchema, value, {
            ...childContext,
            schemaPath: childPath(`${context.schemaPath}/properties`, key),
          }),
        );
      } else if (additional === false) {
        errors.push(
          evaluationError(
            childContext,
            "additionalProperties",
            "additional property is forbidden",
          ),
        );
      } else if (additional !== undefined && additional !== true) {
        errors.push(
          ...evaluate(additional, value, {
            ...childContext,
            schemaPath: `${context.schemaPath}/additionalProperties`,
          }),
        );
      }
    }
  }

  if (Array.isArray(instance)) {
    const minimum = integerKeyword(schema, "minItems");
    const maximum = integerKeyword(schema, "maxItems");
    if (minimum !== undefined && instance.length < minimum)
      errors.push(evaluationError(context, "minItems", "array is too short"));
    if (maximum !== undefined && instance.length > maximum)
      errors.push(evaluationError(context, "maxItems", "array is too long"));
    if (schema["uniqueItems"] !== undefined) {
      if (typeof schema["uniqueItems"] !== "boolean")
        throw new Error(`${context.schemaPath}/uniqueItems must be boolean.`);
      if (
        schema["uniqueItems"] &&
        instance.some((value, index) =>
          instance
            .slice(0, index)
            .some((prior) => isDeepStrictEqual(prior, value)),
        )
      )
        errors.push(
          evaluationError(context, "uniqueItems", "array has duplicates"),
        );
    }
    const items = schema["items"];
    const prefixItems =
      schema["prefixItems"] === undefined
        ? []
        : schemaArray(
            schema["prefixItems"],
            `${context.schemaPath}/prefixItems`,
          );
    instance.forEach((value, index) => {
      const positional = index < prefixItems.length;
      const itemSchema = positional ? prefixItems[index] : items;
      if (itemSchema === undefined) return;
      errors.push(
        ...evaluate(itemSchema, value, {
          ...context,
          instancePath: childPath(context.instancePath, String(index)),
          schemaPath: positional
            ? `${context.schemaPath}/prefixItems/${index}`
            : `${context.schemaPath}/items`,
        }),
      );
    });
    const contains = schema["contains"];
    if (contains !== undefined) {
      const count = instance.filter(
        (value, index) =>
          evaluate(contains, value, {
            ...context,
            instancePath: childPath(context.instancePath, String(index)),
            schemaPath: `${context.schemaPath}/contains`,
          }).length === 0,
      ).length;
      const minContains = integerKeyword(schema, "minContains") ?? 1;
      const maxContains =
        integerKeyword(schema, "maxContains") ?? Number.POSITIVE_INFINITY;
      if (count < minContains || count > maxContains)
        errors.push(
          evaluationError(
            context,
            "contains",
            `matching item count ${count} is outside ${minContains}..${maxContains}`,
          ),
        );
    }
  }

  return errors;
}

export function validateJsonSchema202012(
  schemaValue: unknown,
  instance: unknown,
  referencedSchemas: readonly unknown[] = [],
): JsonSchemaValidationResult {
  const schema = schemaObject(schemaValue, "root schema");
  const registry = schemaRegistry(schema, referencedSchemas);
  const baseUri = schemaId(schema, "root schema");
  const errors = evaluate(schema, instance, {
    registry,
    baseUri,
    instancePath: "",
    schemaPath: `${baseUri}#`,
  });
  return { valid: errors.length === 0, errors };
}
