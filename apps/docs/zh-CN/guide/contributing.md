---
description: "如何为 SnapOtter 做贡献。缺陷报告、功能请求、拉取请求以及 CLA 要求。"
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: ae428c516557
---

# 贡献指南 {#contributing}

感谢你有意参与贡献。本指南介绍如何参与、我们接受哪些内容以及如何开始。

## 贡献方式 {#ways-to-contribute}

### 议题（无需搭建环境） {#issues-no-setup-required}

- **缺陷报告** - 有东西坏了？请附上复现步骤，提交一份 [bug report](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml)。
- **功能请求** - 有想法？请发起一个 [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)，让社区参与讨论并为其投票。
- **翻译问题** - 发现错误或缺失的翻译？请提交一个 [translation issue](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml)。
- **文档问题** - 文档中有不对的地方？请提交一个 [documentation issue](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml)。

### 代码（需要签署 CLA） {#code-requires-cla}

我们接受以下类型的拉取请求：

| 类型 | 流程 |
|------|---------|
| 缺陷修复 | 直接提交 PR（如果已有对应议题，请附上链接） |
| 新增翻译 | 直接提交 PR（参见 [翻译指南](/zh-CN/guide/translations)） |
| 文档改进 | 直接提交 PR |
| 测试覆盖率改进 | 直接提交 PR |
| 新工具或新功能 | 先发起一个 [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)；维护者会在你动手写代码前将获批的想法转化为一个跟踪议题 |
| 重构或架构变更 | 先发起一个 [discussion](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)，并在写代码前等待维护者确认 |

### 我们不会接受的内容 {#what-we-will-not-accept}

- 对 CI/CD 工作流、发布配置或 linter/编译器配置的更改
- 未签署 [Contributor License Agreement](#contributor-license-agreement) 的 PR
- 变更超过 400 行的 PR（请将大工作量拆分为多个较小的 PR）
- 未经事先讨论并获批的功能
- 未经事先讨论对 `packages/ai/` 的更改

## 贡献者许可协议 {#contributor-license-agreement}

在我们合并你的第一个 PR 之前，你必须签署我们的 [Individual CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md)。这是一次性要求。

**原因：** SnapOtter 采用双重许可（AGPLv3 + 商业许可）。CLA 授予我们在这两种许可下分发你贡献的权利。你仍保留对自己作品的全部版权。

**方式：** 当你提交第一个 PR 时，CLA Assistant 机器人会评论并附上一个链接。点击它，查看协议，然后使用你的 GitHub 账户签署。整个过程只需 30 秒。

如果你是代表雇主进行贡献，且你的雇主保留对你作品的知识产权，请在提交前联系 contact@snapotter.com 以安排签署 Corporate CLA。

## 开始上手 {#getting-started}

### 前置条件 {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+（仅 AI 工具需要）
- Docker（可选，用于完整的集成测试）

### 搭建环境 {#setup}

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

### 运行检查 {#running-checks}

在提交 PR 之前，请确保所有检查在本地通过：

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## 拉取请求流程 {#pull-request-process}

1. Fork 仓库并从 `main` 创建分支（`feat/my-feature` 或 `fix/issue-123`）
2. 使用 [conventional commits](https://www.conventionalcommits.org/) 以聚焦、可审阅的提交来完成你的更改
3. 为你的更改新增或更新测试
4. 在本地运行 `pnpm lint && pnpm typecheck && pnpm test`
5. 针对 `main` 提交 PR 并填写模板
6. 如有提示，请签署 CLA
7. 等待 CI 通过以及维护者审阅

### 审阅预期 {#review-expectations}

- 我们的目标是在 7 天内回复 PR
- 小而聚焦的 PR 会更快得到审阅
- 如果 7 天内没有回音，请在讨论串中留言提醒
- 我们可能会请求修改、建议采用不同的方案，或者在 PR 与项目方向不符时将其关闭

### 你的 PR 合并之后 {#after-your-pr-is-merged}

你的贡献将被纳入下一个版本发布，并在变更日志中署名。

## 适合新手的议题 {#good-first-issues}

想找点事情做？可以查看我们的 [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)，那里有适合初学者的任务；也可以看看 [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)，那里有一些我们希望得到社区帮助的较大工作项。

## 代码风格 {#code-style}

- Biome 负责格式化和 lint（双引号、分号、2 空格缩进）
- 预提交钩子会自动对暂存文件运行 `biome check --write`
- 如果 linter 报错，请修改代码（不要修改 Biome 配置）
- 处处使用 ES 模块（`import`/`export`）
- Conventional commits：`feat:`、`fix:`、`refactor:`、`docs:`、`test:`、`chore:`

有关完整的架构细节，请参见 [开发者指南](/zh-CN/guide/developer)。

## 安全 {#security}

**请勿为安全漏洞提交公开的 PR 或议题。** 请通过 [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) 或发送邮件至 contact@snapotter.com 私下报告。完整细节参见 [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md)。

## 有疑问？ {#questions}

- [文档](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
