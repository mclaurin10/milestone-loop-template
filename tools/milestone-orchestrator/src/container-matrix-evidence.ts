import { isDeepStrictEqual } from "node:util";

import {
  inventoryContainerArtifacts,
  publishContainerArtifacts,
  type ContainerArtifactLimits,
} from "./container-artifacts.js";

// Keep the real exported bytes independently inspectable after fixture cleanup.
// The executor's inventory is the expected identity, never a replacement for it.
export async function retainOciWorkspaceArtifacts(input: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly expectedInventory: unknown;
  readonly limits: ContainerArtifactLimits;
}): Promise<void> {
  const source = await inventoryContainerArtifacts(
    input.sourceRoot,
    input.limits,
  );
  if (!isDeepStrictEqual(source, input.expectedInventory))
    throw new Error(
      "OCI workspace artifacts differ from the containment inventory.",
    );
  await publishContainerArtifacts(input);
  const retained = await inventoryContainerArtifacts(
    input.destinationRoot,
    input.limits,
  );
  if (!isDeepStrictEqual(retained, input.expectedInventory))
    throw new Error(
      "Retained OCI workspace artifacts differ from the containment inventory.",
    );
}
