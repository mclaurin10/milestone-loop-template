# Portable orchestrator distribution

Use Node 24.18.0 and pnpm 11.15.1. Extract the inspected release archive into a new directory, then run `pnpm install --frozen-lockfile --package-import-method=copy` there. The archive contains the TypeScript runtime, schemas, generation scaffold and exact dependency lock; dependencies are installed separately.

Generate a repository with `pnpm loop:template:create --definition fixtures/fresh-adopter/definition.json --output <absent-directory>`, or supply your own definition and authority files using the same schema. The example supplies its own frozen bootstrap authority. From the generated repository, `pnpm install --frozen-lockfile --package-import-method=copy` prepares its independent dependencies. Follow its README for commissioning and bootstrap verification.

`SOURCE.json` identifies the source commit/tree used to package these bytes. It grants no source authority or readiness status to a generated adopter. Generation alone does not prove commissioning, bootstrap, product readiness or human acceptance.

The source build retains a sorted path/size/SHA-256 inventory, deterministic archive and actual detached generation observation. Full repeated native build and inaccessible-source consumer qualification remain separately required by the approved source contract.
