---
description: "如何為 SnapOtter 做出貢獻。錯誤回報、功能請求、拉取請求以及 CLA 要求。"
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: 28b8b8d90d65
---

# 貢獻 {#contributing}

感謝你有興趣做出貢獻。本指南涵蓋如何參與、我們接受哪些內容，以及如何開始。

## 貢獻方式 {#ways-to-contribute}

### 議題（無需設定環境） {#issues-no-setup-required}

- **錯誤回報** - 有東西壞了？開一個附上重現步驟的[錯誤回報](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml)。
- **功能請求** - 有想法？發起一則[討論](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)，讓社群可以參與評估並投票支持。
- **翻譯問題** - 發現錯誤或缺漏的翻譯？開一個[翻譯議題](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml)。
- **文件問題** - 文件裡有不對勁的地方？開一個[文件議題](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml)。

### 程式碼（需要 CLA） {#code-requires-cla}

我們接受以下類型的拉取請求：

| 類型 | 流程 |
|------|---------|
| 錯誤修正 | 直接開一個 PR（若已有對應議題，請附上連結） |
| 新增翻譯 | 直接開一個 PR（見[翻譯指南](/zh-TW/guide/translations)） |
| 文件改進 | 直接開一個 PR |
| 測試覆蓋率改進 | 直接開一個 PR |
| 新工具或新功能 | 先發起一則[討論](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)；維護者會在你動手寫程式碼之前，把獲准的想法轉為受追蹤的議題 |
| 重構或架構變更 | 先發起一則[討論](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas)，並在寫程式碼之前等待維護者的同意 |

### 我們不接受哪些內容 {#what-we-will-not-accept}

- 對 CI/CD 工作流程、發布設定，或 linter／compiler 設定的變更
- 未簽署[貢獻者授權合約](#contributor-license-agreement)的 PR
- 變更超過 400 行的 PR（請把大型工作拆成較小的 PR）
- 未經事先討論並獲准的功能
- 未經事先討論就變更 `packages/ai/`

## 貢獻者授權合約 {#contributor-license-agreement}

在我們合併你的第一個 PR 之前，你必須簽署我們的[個人 CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md)。這是一次性的要求。

**原因：** SnapOtter 採用雙重授權（AGPLv3 + 商業授權）。CLA 賦予我們在這兩種授權下散布你貢獻內容的權利。你仍保有作品完整的著作權。

**做法：** 當你開出第一個 PR 時，CLA Assistant 機器人會留言附上連結。點擊它、閱讀合約，並用你的 GitHub 帳號簽署。只需 30 秒。

如果你是代表雇主做出貢獻，且雇主保有你作品的智慧財產權，請在提交前透過 contact@snapotter.com 聯絡我們，安排企業 CLA。

## 開始 {#getting-started}

### 先決條件 {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+（僅供 AI 工具使用）
- Docker（選用，供完整整合測試使用）

### 設定 {#setup}

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

### 執行檢查 {#running-checks}

在提交 PR 之前，請確保所有檢查在本機都能通過：

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## 拉取請求流程 {#pull-request-process}

1. Fork 儲存庫，並從 `main` 建立一個分支（`feat/my-feature` 或 `fix/issue-123`）
2. 使用[慣例式提交](https://www.conventionalcommits.org/)，以聚焦、易於審查的提交進行變更
3. 為你的變更新增或更新測試
4. 在本機執行 `pnpm lint && pnpm typecheck && pnpm test`
5. 針對 `main` 開一個 PR 並填寫範本
6. 若被提示，簽署 CLA
7. 等待 CI 通過並由維護者審查

### 審查預期 {#review-expectations}

- 我們的目標是在 7 天內回應 PR
- 小而聚焦的 PR 會更快獲得審查
- 若你在 7 天內未收到回覆，請在該討論串留言 ping 一下
- 我們可能會請求變更、建議不同的做法，或在 PR 不符合專案方向時關閉它

### PR 合併之後 {#after-your-pr-is-merged}

你的貢獻會納入下一個版本，並在變更日誌中列名致謝。

## 適合新手的議題 {#good-first-issues}

想找點事做？看看我們的[適合新手的議題](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)，那些是對初學者友善的任務；或看看[徵求協助](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)，那些是我們樂見社群協助的較大項目。

## 程式碼風格 {#code-style}

- Biome 處理格式化與 linting（雙引號、分號、2 格縮排）
- 提交前掛勾（pre-commit hook）會自動在暫存的檔案上執行 `biome check --write`
- 若 linter 有意見，請修正程式碼（不要修改 Biome 設定）
- 所有工作區一律使用 ES 模組（`import`／`export`）
- 慣例式提交：`feat:`、`fix:`、`refactor:`、`docs:`、`test:`、`chore:`

完整的架構細節，請見[開發者指南](/zh-TW/guide/developer)。

## 安全性 {#security}

**請勿為安全漏洞開立公開的 PR 或議題。**請透過 [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) 或電子郵件 contact@snapotter.com 私下回報。完整細節請見 [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md)。

## 有疑問？ {#questions}

- [文件](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
