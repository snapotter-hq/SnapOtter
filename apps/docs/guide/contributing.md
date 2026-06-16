---
description: How to contribute to SnapOtter. Bug reports, feature requests, pull requests, and CLA requirements.
---

# Contributing

Thanks for your interest in contributing. This guide covers how to participate, what we accept, and how to get started.

## Ways to contribute

### Issues (no setup required)

- **Bug reports** - Something broken? Open a [bug report](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) with reproduction steps.
- **Feature requests** - Have an idea? Open a [feature request](https://github.com/snapotter-hq/snapotter/issues/new?template=feature_request.yml) describing the problem it solves.

### Code (requires CLA)

We accept pull requests for:

| Type | Process |
|------|---------|
| Bug fixes | Open a PR directly (link the issue if one exists) |
| New translations | Open a PR directly (see [Translation Guide](/guide/translations)) |
| Documentation improvements | Open a PR directly |
| Test coverage improvements | Open a PR directly |
| New tools or features | Open an issue first, wait for the `approved` label before writing code |
| Refactors or architecture changes | Open an issue first, wait for the `approved` label before writing code |

### What we will not accept

- Changes to CI/CD workflows, release config, or linter/compiler config
- PRs without a signed [Contributor License Agreement](#contributor-license-agreement)
- PRs over 400 lines of change (break large work into smaller PRs)
- Features that were not discussed and approved in an issue first
- Changes to `packages/ai/` without prior discussion

## Contributor License Agreement

Before we can merge your first PR, you must sign our [Individual CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). This is a one-time requirement.

**Why:** SnapOtter is dual-licensed (AGPLv3 + commercial). The CLA grants us the right to distribute your contributions under both licenses. You retain full copyright ownership of your work.

**How:** When you open your first PR, the CLA Assistant bot will comment with a link. Click it, review the agreement, and sign with your GitHub account. Takes 30 seconds.

If you are contributing on behalf of your employer and your employer retains IP rights over your work, contact contact@snapotter.com to arrange a Corporate CLA before submitting.

## Getting started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Python 3.11+ (only for AI tools)
- Docker (optional, for full integration testing)

### Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### Running checks

Before submitting a PR, ensure all checks pass locally:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Pull request process

1. Fork the repo and create a branch from `main` (`feat/my-feature` or `fix/issue-123`)
2. Make your changes in focused, reviewable commits using [conventional commits](https://www.conventionalcommits.org/)
3. Add or update tests for your changes
4. Run `pnpm lint && pnpm typecheck && pnpm test` locally
5. Open a PR against `main` and fill out the template
6. Sign the CLA if prompted
7. Wait for CI to pass and a maintainer to review

### Review expectations

- We aim to respond to PRs within 7 days
- Small, focused PRs get reviewed faster
- If you have not heard back in 7 days, leave a comment pinging the thread
- We may request changes, suggest a different approach, or close the PR if it does not align with project direction

### After your PR is merged

Your contribution will be included in the next release and credited in the changelog.

## Good first issues

Looking for something to work on? Check our [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for beginner-friendly tasks, or [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) for larger items where we'd appreciate community help.

## Code style

- Biome handles formatting and linting (double quotes, semicolons, 2-space indent)
- Pre-commit hook runs `biome check --write` on staged files automatically
- If the linter complains, fix the code (do not modify Biome config)
- ES modules everywhere (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

For full architecture details, see the [Developer Guide](/guide/developer).

## Security

**Do not open a public PR or issue for security vulnerabilities.** Report them privately through [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) or email contact@snapotter.com. See [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) for full details.

## Questions?

- [Documentation](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
