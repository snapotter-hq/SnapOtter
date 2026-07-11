---
description: "SnapOtter에 기여하는 방법. 버그 리포트, 기능 요청, 풀 리퀘스트, CLA 요구사항."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: f7601dee43cc
---

# 기여하기 {#contributing}

기여에 관심을 가져주셔서 감사합니다. 이 가이드는 참여 방법, 우리가 수용하는 항목, 시작하는 방법을 다룹니다.

## 기여하는 방법 {#ways-to-contribute}

### 이슈 (설정 불필요) {#issues-no-setup-required}

- **버그 리포트** - 무언가 고장났나요? 재현 단계를 포함해 [버그 리포트](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml)를 여세요.
- **기능 요청** - 아이디어가 있나요? [토론](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)을 시작해 커뮤니티가 의견을 내고 추천할 수 있게 하세요.
- **번역 이슈** - 잘못되거나 누락된 번역을 발견했나요? [번역 이슈](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml)를 여세요.
- **문서 이슈** - 문서에서 이상한 점이 있나요? [문서 이슈](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml)를 여세요.

### 코드 (CLA 필요) {#code-requires-cla}

다음 항목에 대한 풀 리퀘스트를 수용합니다:

| 유형 | 절차 |
|------|---------|
| 버그 수정 | PR을 직접 여세요 (해당 이슈가 있으면 연결) |
| 새 번역 | PR을 직접 여세요 ([번역 가이드](/ko/guide/translations) 참고) |
| 문서 개선 | PR을 직접 여세요 |
| 테스트 커버리지 개선 | PR을 직접 여세요 |
| 새 도구 또는 기능 | 먼저 [토론](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)을 시작하세요. 승인된 아이디어는 메인테이너가 추적 이슈로 전환한 뒤 코드를 작성합니다 |
| 리팩터링 또는 아키텍처 변경 | 먼저 [토론](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)을 시작하고 코드를 작성하기 전에 메인테이너의 승인을 기다리세요 |

### 수용하지 않는 항목 {#what-we-will-not-accept}

- CI/CD 워크플로우, 릴리스 설정, 린터/컴파일러 설정 변경
- 서명된 [기여자 라이선스 계약](#contributor-license-agreement)이 없는 PR
- 변경 범위가 400줄을 초과하는 PR (큰 작업은 더 작은 PR로 나누세요)
- 사전에 논의하고 승인하지 않은 기능
- 사전 논의 없는 `packages/ai/` 변경

## 기여자 라이선스 계약 {#contributor-license-agreement}

첫 PR을 병합하기 전에 [개인 CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md)에 서명해야 합니다. 이것은 일회성 요구사항입니다.

**이유:** SnapOtter는 이중 라이선스(AGPLv3 + 상업용)입니다. CLA는 여러분의 기여를 두 라이선스로 배포할 권리를 우리에게 부여합니다. 여러분은 작업물에 대한 저작권을 온전히 유지합니다.

**방법:** 첫 PR을 열면 CLA Assistant 봇이 링크와 함께 댓글을 남깁니다. 링크를 클릭하고 계약 내용을 검토한 뒤 GitHub 계정으로 서명하세요. 30초면 됩니다.

고용주를 대신해 기여하고 있고 고용주가 여러분 작업물에 대한 IP 권리를 보유한다면, 제출 전에 contact@snapotter.com으로 연락해 기업용 CLA를 준비하세요.

## 시작하기 {#getting-started}

### 사전 요구사항 {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (AI 도구에만 필요)
- Docker (선택 사항, 전체 통합 테스트용)

### 설정 {#setup}

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

### 검사 실행 {#running-checks}

PR을 제출하기 전에 모든 검사가 로컬에서 통과하는지 확인하세요:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## 풀 리퀘스트 절차 {#pull-request-process}

1. 저장소를 포크하고 `main`에서 브랜치를 만드세요 (`feat/my-feature` 또는 `fix/issue-123`)
2. [conventional commits](https://www.conventionalcommits.org/)를 사용해 집중적이고 검토 가능한 커밋으로 변경하세요
3. 변경 사항에 대한 테스트를 추가하거나 업데이트하세요
4. 로컬에서 `pnpm lint && pnpm typecheck && pnpm test`를 실행하세요
5. `main`에 대한 PR을 열고 템플릿을 작성하세요
6. 안내가 나오면 CLA에 서명하세요
7. CI가 통과하고 메인테이너가 검토할 때까지 기다리세요

### 검토 기대사항 {#review-expectations}

- PR에 7일 이내에 응답하는 것을 목표로 합니다
- 작고 집중된 PR이 더 빠르게 검토됩니다
- 7일 안에 회신을 받지 못했다면 스레드에 핑을 거는 댓글을 남기세요
- 변경을 요청하거나, 다른 접근을 제안하거나, 프로젝트 방향과 맞지 않으면 PR을 닫을 수 있습니다

### PR이 병합된 후 {#after-your-pr-is-merged}

여러분의 기여는 다음 릴리스에 포함되며 변경 로그에 크레딧이 표시됩니다.

## 첫 기여로 좋은 이슈 {#good-first-issues}

작업할 거리를 찾고 있나요? 초심자에게 적합한 작업은 [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)를, 커뮤니티의 도움이 필요한 더 큰 항목은 [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)를 확인하세요.

## 코드 스타일 {#code-style}

- Biome가 포매팅과 린팅을 처리합니다 (큰따옴표, 세미콜론, 2칸 들여쓰기)
- 사전 커밋 훅이 스테이징된 파일에 대해 `biome check --write`을 자동으로 실행합니다
- 린터가 문제를 지적하면 코드를 고치세요 (Biome 설정을 수정하지 마세요)
- 모든 곳에서 ES 모듈 사용 (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

전체 아키텍처 세부사항은 [개발자 가이드](/ko/guide/developer)를 참고하세요.

## 보안 {#security}

**보안 취약점에 대해 공개 PR이나 이슈를 열지 마세요.** [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new)를 통해 비공개로 보고하거나 contact@snapotter.com으로 이메일을 보내세요. 자세한 내용은 [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md)를 참고하세요.

## 질문이 있나요? {#questions}

- [문서](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
