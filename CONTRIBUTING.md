# Contributing to SnapOtter

Thanks for your interest in contributing. This guide covers how to participate, what we accept, and how to set up your development environment.

## Ways to Contribute

### Issues (no setup required)

- **Bug reports** - Something broken? Open a [bug report](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) with reproduction steps.
- **Feature requests** - Have an idea? Start a [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) so the community can weigh in and upvote it.
- **Translation issues** - Spot a wrong or missing translation? Open a [translation issue](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Documentation issues** - Something off in the docs? Open a [documentation issue](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Code (requires CLA)

We accept pull requests for:

| Type | Process |
|------|---------|
| Bug fixes | Open a PR directly (link the issue if one exists) |
| New translations | Open a PR directly (see [Translation Guide](https://docs.snapotter.com/guide/translations)) |
| Documentation improvements | Open a PR directly |
| Test coverage improvements | Open a PR directly |
| New tools or features | Start a [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) first; a maintainer converts approved ideas into a tracked issue before you write code |
| Refactors or architecture changes | Start a [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) first and wait for maintainer sign-off before writing code |

### What We Will Not Accept

- Changes to CI/CD workflows, release config, or linter/compiler config
- PRs without a signed [Contributor License Agreement](#contributor-license-agreement)
- PRs over 400 lines of change (break large work into smaller PRs)
- Features that were not discussed and approved first
- Changes to `packages/ai/` without prior discussion

## Contributor License Agreement

Before we can merge your first PR, you must sign our [Individual CLA](CLA.md). This is a one-time requirement.

**Why:** SnapOtter is dual-licensed (AGPLv3 + commercial). The CLA grants us the right to distribute your contributions under both licenses. You retain full copyright ownership of your work.

**How:** When you open your first PR, the CLA Assistant bot will comment with a link. Click it, review the agreement, and sign with your GitHub account. Takes 30 seconds.

If you are contributing on behalf of your employer and your employer retains IP rights over your work, contact contact@snapotter.com to arrange a Corporate CLA before submitting.

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Python 3.11+ (only for AI tools)
- Docker (optional, for full integration testing)

### Getting Started

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### Running Checks

Before submitting a PR, ensure all checks pass locally:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

To run a single test file:

```bash
pnpm vitest run tests/unit/my-test.test.ts
pnpm vitest run tests/integration/my-test.test.ts
```

### Code Style

- Biome handles formatting and linting (double quotes, semicolons, 2-space indent)
- Pre-commit hook runs `biome check --write` on staged files automatically
- If the linter complains, fix the code (do not modify Biome config)
- ES modules everywhere (`import`/`export`, `.js` extensions on relative imports)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

### Architecture Quick Reference

A tool lives in three places sharing a `toolId` string:

1. **Shared metadata** - `packages/shared/src/constants.ts` (TOOLS array)
2. **API route** - `apps/api/src/routes/tools/<toolId>.ts` (uses `createToolRoute` factory)
3. **Frontend settings** - `apps/web/src/components/tools/<toolId>-settings.tsx`

For full architecture details, see the [Developer Guide](https://docs.snapotter.com/guide/developer).

## Pull Request Process

1. Fork the repo and create a branch from `main` (`feat/my-feature` or `fix/issue-123`)
2. Make your changes in focused, reviewable commits using [conventional commits](https://www.conventionalcommits.org/)
3. Add or update tests for your changes
4. Run `pnpm lint && pnpm typecheck && pnpm test` locally
5. Open a PR against `main` and fill out the template
6. Sign the CLA if prompted
7. Wait for CI to pass and a maintainer to review

### Review Expectations

- We aim to respond to PRs within 7 days
- Small, focused PRs get reviewed faster
- If you have not heard back in 7 days, leave a comment pinging the thread
- We may request changes, suggest a different approach, or close the PR if it does not align with project direction

### After Your PR is Merged

Your contribution will be included in the next release and credited in the changelog.

## Security Vulnerabilities

**Do not open a public PR or issue for security vulnerabilities.** Report them privately through [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) or email contact@snapotter.com. See [SECURITY.md](SECURITY.md) for full details.

## Questions?

- [Documentation](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr) - for help and discussion
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions) - for longer-form questions
