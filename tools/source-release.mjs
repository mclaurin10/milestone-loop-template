import { register } from "tsx/esm/api";

register();
const { sourceReleaseMain } = await import("./source-release-command.mjs");
await sourceReleaseMain(process.argv.slice(2));
