import { register } from "tsx/esm/api";

register();
const { planningQualificationMain } =
  await import("./milestone-orchestrator/src/planning-qualification.ts");
await planningQualificationMain(process.argv.slice(2));
