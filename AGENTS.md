# AGENTS.md

## Project

`learn-demo` is a Vite + React demo host for small learning examples. It uses TypeScript,
TanStack Router file routes, and antd-mobile for mobile-friendly UI primitives.

## Commands

- `pnpm dev` starts Vite.
- `pnpm routes:generate` regenerates `src/routeTree.gen.ts`.
- `pnpm typecheck` regenerates routes and runs TypeScript.
- `pnpm lint` runs Biome.
- `pnpm knip` checks for unused files, exports, and dependencies.
- `pnpm check` runs `typecheck`, `lint`, and `knip`.
- `pnpm build` typechecks and builds the production bundle.

## Conventions

- Add demos as file routes under `src/routes`.
- Keep `src/routeTree.gen.ts` generated; do not edit it manually.
- Prefer antd-mobile components for reusable controls and mobile-facing UI.
- Keep mobile navigation compact: use the top-left menu button and left drawer pattern.
- Use Three.js for 3D or shader-driven demos, and verify desktop plus mobile rendering.
- Keep page-specific custom CSS in `src/index.css` until the app grows enough to split styles.
- React StrictMode and TanStack Router Devtools are intentionally disabled for this demo host.

## Checks

Before handing off changes, run:

```sh
pnpm check
pnpm build
```
