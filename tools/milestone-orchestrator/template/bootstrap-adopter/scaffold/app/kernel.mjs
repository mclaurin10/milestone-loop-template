export const SAVE_SCHEMA_VERSION = "bootstrap-save.v1";

const ACTIONS = new Set(["extract", "idle"]);

function assertInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a nonnegative safe integer.`);
  return value;
}

export function assertSmokeState(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "extracted,lastAction,tick"
  )
    throw new Error("Smoke state has an invalid shape.");
  const state = value;
  assertInteger(state.tick, "tick");
  assertInteger(state.extracted, "extracted");
  if (state.lastAction !== null && !ACTIONS.has(state.lastAction))
    throw new Error("Smoke state lastAction is invalid.");
  return {
    tick: state.tick,
    extracted: state.extracted,
    lastAction: state.lastAction,
  };
}

export function initialSmokeState() {
  return { tick: 0, extracted: 0, lastAction: null };
}

export function applyUserAction(state, action) {
  const current = assertSmokeState(state);
  if (!ACTIONS.has(action)) throw new Error(`Unknown user action: ${action}.`);
  return {
    tick: current.tick + 1,
    extracted: current.extracted + (action === "extract" ? 2 : 0),
    lastAction: action,
  };
}

export function runUserActions(actions, startingState = initialSmokeState()) {
  if (!Array.isArray(actions))
    throw new Error("User actions must be an array.");
  return actions.reduce(
    (state, action) => applyUserAction(state, action),
    assertSmokeState(startingState),
  );
}

export function canonicalCheckpoint(state) {
  const checked = assertSmokeState(state);
  return JSON.stringify({
    extracted: checked.extracted,
    lastAction: checked.lastAction,
    tick: checked.tick,
  });
}

export function createSaveEnvelope(state) {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    state: assertSmokeState(state),
  };
}

export function loadSaveEnvelope(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "schemaVersion,state" ||
    value.schemaVersion !== SAVE_SCHEMA_VERSION
  )
    throw new Error("Save envelope is invalid.");
  return assertSmokeState(value.state);
}
