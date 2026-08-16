import { fileURLToPath } from "node:url";

export const freshAdopterDefinitionPath = fileURLToPath(
  new URL("definition.json", import.meta.url),
);
