import assert from "node:assert/strict";
import { appendFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";

// Observation only: the normal verbose/JSON reporters and production receipt
// validator still own test outcomes. This bounded log makes long native runs
// observable without changing the supervisor, test order, or any deadline.
export default class ProgressReporter {
  constructor() {
    this.path = process.env.C6A_FOCUSED_PROGRESS;
    assert(this.path && isAbsolute(this.path));
    this.bytes = 0;
    writeFileSync(this.path, "", { flag: "wx" });
  }
  record(event, detail) {
    const line =
      JSON.stringify({
        event,
        observedAt: new Date().toISOString(),
        ...detail,
      }) + "\n";
    this.bytes += Buffer.byteLength(line);
    assert(
      this.bytes <= 1024 * 1024,
      "Focused progress exceeded its finite output bound.",
    );
    appendFileSync(this.path, line);
  }
  onTestRunStart(specifications) {
    this.record("run-start", { modules: specifications.length });
  }
  onTestModuleStart(module) {
    this.record("module-start", { path: module.relativeModuleId });
  }
  onTestModuleEnd(module) {
    this.record("module-end", {
      path: module.relativeModuleId,
      state: module.state(),
    });
  }
  onTestCaseResult(test) {
    this.record("case-end", {
      path: test.module.relativeModuleId,
      name: test.fullName,
      state: test.result().state,
    });
  }
  onTestRunEnd(modules, errors, reason) {
    this.record("run-end", {
      modules: modules.length,
      unhandledErrors: errors.length,
      reason,
    });
  }
}
