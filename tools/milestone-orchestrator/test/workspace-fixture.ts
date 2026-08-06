import { randomUUID } from "node:crypto";

import type { IsolatedWorkspaceRecord } from "../src/contracts.js";
import { workspaceRecordFromOperation } from "../src/operation-intent.js";
import {
  cloneWorkspaceCreateTemporary,
  planWorkspaceCreateOperation,
  publishWorkspaceCreateTemporary,
} from "../src/workspace-create.js";

export async function createIsolatedWorkspaceFixture(input: {
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly targetBranch: string;
  readonly baseCommit: string;
  readonly runId: string;
  readonly milestoneId: string;
  readonly now: string;
}): Promise<IsolatedWorkspaceRecord> {
  const operation = planWorkspaceCreateOperation({
    operationId: `fixture-${randomUUID()}`,
    inputStateGeneration: "f".repeat(40),
    inputStateRevision: 0,
    repositoryRoot: input.repositoryRoot,
    configuredWorkspaceRoot: input.workspaceRoot,
    targetBranch: input.targetBranch,
    baseCommit: input.baseCommit,
    runId: input.runId,
    milestoneId: input.milestoneId,
    attempt: 1,
    now: input.now,
  });
  await cloneWorkspaceCreateTemporary(operation);
  await publishWorkspaceCreateTemporary(operation);
  return workspaceRecordFromOperation(operation);
}
