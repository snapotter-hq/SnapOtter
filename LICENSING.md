# Licensing

SnapOtter is open-core:

- **All content in this repository is licensed under AGPL-3.0 (see `LICENSE`),
  EXCEPT the contents of `packages/enterprise/`.**
- `packages/enterprise/` is governed by the SnapOtter Commercial License
  (see `packages/enterprise/LICENSE`).

The community edition is fully functional without any code from
`packages/enterprise`: all tools, batch, pipelines, API keys, and single-node
operation work without a license key. Enterprise features (see
`ENTERPRISE_FEATURES` in `packages/enterprise/src/license.ts`) activate only
with a valid commercial license key.

Core code may import only the public API of `@snapotter/enterprise` (its
package entry point), never its internals. This boundary is enforced in CI by
`scripts/check-license-boundary.mjs`.
