---
description: "SnapOtter 支援的 21 種語言，以及如何使用受 TypeScript 強制檢查的 i18n 系統來建立或改善翻譯。"
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: c06a7448962a
---

# 翻譯指南 {#translation-guide}

SnapOtter 內建支援 21 種語言。其 i18n 系統採用輕量的自訂執行環境，具備受 TypeScript 強制檢查的語系完整性，以及動態程式碼分割。

## 支援的語言 {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | English | English | LTR |
| `zh-CN` | Chinese (Simplified) | 简体中文 | LTR |
| `zh-TW` | Chinese (Traditional) | 繁體中文 | LTR |
| `ja` | Japanese | 日本語 | LTR |
| `ko` | Korean | 한국어 | LTR |
| `es` | Spanish | Español | LTR |
| `fr` | French | Français | LTR |
| `it` | Italian | Italiano | LTR |
| `pt-BR` | Portuguese (Brazil) | Português (Brasil) | LTR |
| `de` | German | Deutsch | LTR |
| `nl` | Dutch | Nederlands | LTR |
| `sv` | Swedish | Svenska | LTR |
| `ru` | Russian | Русский | LTR |
| `pl` | Polish | Polski | LTR |
| `uk` | Ukrainian | Українська | LTR |
| `ar` | Arabic | العربية | RTL |
| `tr` | Turkish | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamese | Tiếng Việt | LTR |
| `id` | Indonesian | Bahasa Indonesia | LTR |
| `th` | Thai | ไทย | LTR |

## 語言偵測的運作方式 {#how-language-detection-works}

SnapOtter 採用三層解析順序：

1. **使用者偏好** - 儲存在 `localStorage("snapotter-locale")`，並在已驗證身分時同步至使用者設定
2. **瀏覽器自動偵測** - 以 BCP 47 前綴比對走訪 `navigator.languages` 陣列
3. **執行個體預設值** - 管理員的 `DEFAULT_LOCALE` 環境變數（從 `GET /api/v1/config/locale` 取得）
4. **英文備援** - 永遠可用

使用者可從以下位置變更語言：
- **頁尾的地球選擇器**（桌面版，永遠可見）
- **登入頁面**的語言選擇器（登入前）
- **設定 > 一般**區段（每位使用者的偏好）
- **行動版側邊欄**的語言下拉選單
- **設定 > 系統**區段可設定整個執行個體的預設值（僅限管理員）

## 翻譯的運作方式 {#how-translations-work}

所有 UI 字串都放在 `packages/shared/src/i18n/`。參考檔案是 `en.ts`，它匯出一個具型別的物件，包含應用程式使用的每個字串（約 1500 個鍵）。其他語言則是分開的檔案（例如 `de.ts`、`fr.ts`），匯出相同的結構。

`TranslationKeys` 型別使用 `DeepStringRecord` 接受任意字串值，同時強制檢查鍵結構。TypeScript 會在編譯時期抓出任何翻譯檔案中缺少的鍵。

執行階段只會透過動態 `import()` 載入目前使用中的語系，讓主要套件保持精簡。

## 在元件中使用翻譯 {#using-translations-in-components}

```tsx
import { useTranslation } from "@/contexts/i18n-context";
import { format, plural } from "@/lib/format";

function MyComponent() {
  const { t, locale, setLocale } = useTranslation();
  
  return (
    <div>
      <h1>{t.common.settings}</h1>
      <p>{format(t.settings.people.deleteConfirm, { username: "admin" })}</p>
      <p>{plural(count, t.automate.fileCount, t.automate.fileCountPlural)}</p>
    </div>
  );
}
```

## 貢獻翻譯 {#contributing-a-translation}

我們歡迎直接提交翻譯 PR。你可以改善既有的語系，或新增一個語系。

若要在不提交程式碼的情況下回報翻譯錯誤，請開一個 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)，並附上語言、錯誤的字串以及建議的修正。

::: tip 
翻譯 PR 不需要事先核准。Fork 儲存庫、進行你的變更，然後開一個 PR。完整的 PR 流程與 CLA 要求請參閱 [Contributing Guide](/zh-TW/guide/contributing)。
:::

## 如何建立或更新翻譯 {#how-to-create-or-update-a-translation}

### 1. Fork 並複製 {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 複製參考檔案（僅限新語言）{#_2-copy-the-reference-file-new-language-only}

若你是在改善既有的翻譯，請略過此步驟。

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. 翻譯字串 {#_3-translate-the-strings}

開啟你的新檔案並翻譯每個字串值。物件結構與鍵請保持完全相同。

```ts
import type { TranslationKeys } from "./en.js";

export const xx: TranslationKeys = {
  common: {
    upload: "Your translation here",
    // ... translate all entries
  },
  // ... translate all sections
} as const;
```

規則：
- 不要翻譯物件的鍵，只翻譯字串值
- 在結尾保留 `as const`
- 從 `./en.js` 匯入 `TranslationKeys` 並為你的匯出加上型別
- 讓 `{variable}` 佔位符保持原樣
- 陣列（`rotatingPhrases`、`progressMessages`）必須有相同數量的項目
- 不要翻譯：SnapOtter、JPEG、PNG、WebP、EXIF、API 以及其他技術術語

### 4. 註冊語系（僅限新語言）{#_4-register-the-locale-new-language-only}

在 `packages/shared/src/i18n/index.ts` 中將你的語系加入 `SUPPORTED_LOCALES`：

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. 驗證 {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. 提交 {#_6-submit}

對 `main` 開一個 PR，標題類似 `feat(i18n): add Swedish translation` 或 `fix(i18n): correct German typos`。CLA 機器人會在你第一次貢獻時要求你簽署。

## 新增翻譯鍵 {#adding-new-translation-keys}

當你新增需要新 UI 字串的功能時：

1. 先將新鍵加入 `en.ts`（參考檔案）
2. 執行 `pnpm typecheck` - 任何缺少新鍵的語系檔案都會失敗
3. 將新鍵加入所有語系檔案（暫時以英文作為備援）

## 設定 {#configuration}

透過環境變數設定執行個體的預設語言：

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## 檔案參考 {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 英文字串（參考語系，約 1500 個鍵）|
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`、`loadTranslations()`、型別匯出 |
| `packages/shared/src/i18n/<locale>.ts` | 各語言的翻譯檔案 |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`、`useTranslation()` hook |
| `apps/web/src/lib/format.ts` | `format()`、`plural()`、`formatFileSize()` 輔助函式 |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 公開端點 |

## 翻譯網站、文件與 API 參考 {#translating-the-web-surfaces}

上述的 21 種語言支援涵蓋的是**應用程式**。公開網站（snapotter.com）、這個文件網站以及 REST API 參考同樣會翻譯成全部 21 種語言，由另一條經過雜湊把關的流程處理，該流程重複使用 `packages/shared/src/i18n` 中相同的工具名稱與描述，因此各處的術語都保持一致。

### 預設為機器翻譯 {#machine-translated-by-default}

網站與文件上的每個非英文頁面在第一輪都是**機器翻譯**的（由 Claude Code 工作階段完成，而非第三方服務），並帶有一個小巧、可關閉的橫幅來說明這一點，還附上回到本頁的連結。這是刻意的：它能快速且誠實地推出全部 21 種語言，接著邀請社群去精修最重要的頁面。機器翻譯能傳達意思；人工審閱則讓文字讀起來自然。

### 流程如何決定要翻譯什麼 {#how-the-web-pipeline-decides}

每個可翻譯的英文原文單元都會被雜湊，且該雜湊值會與其翻譯一併儲存。每次執行時，流程會：

- 翻譯任何尚未有翻譯的單元，
- 略過任何儲存的雜湊值仍與英文原文相符的單元，
- 當**機器**單元的英文原文變更時，重新翻譯它，
- 當經**人工**精修的單元的英文原文變更時，將其標記為 `stale`（需要審閱），而非覆蓋你的成果。

### 透過 PR 精修網頁翻譯 {#refining-a-web-translation-by-pr}

你精修網站、文件或 API 參考翻譯的方式，與改善應用程式語系相同：編輯產生的檔案並開一個 PR。

1. 找到你語言的產生翻譯：
   - 網站 UI 字串：`apps/landing/src/i18n/<locale>.json`
   - 某個文件頁面：`apps/docs/<locale>/**.md`
   - API 參考：`apps/api/src/openapi.<locale>.yaml`
2. 編輯文字。程式碼、連結、`{placeholders}` 以及任何 `⸤I18N…⸥` 標記都請保持原樣；流程的驗證器會拒絕丟失或重新排序它們的翻譯。
3. 開一個 PR。編輯一個單元會將其來源標記從 `machine` 翻轉為 `human`，因此流程在之後的執行中**絕不會覆蓋它**。若英文原文之後變更，你的單元會被標記為 `stale` 以供審閱，而不是被靜默取代。

若要在不提交程式碼的情況下回報翻譯錯誤，請開一個 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)，並附上頁面 URL、語言、錯誤的文字以及你建議的修正。

::: tip 
翻譯流程由維護者執行；你不需要 API 金鑰即可貢獻。只要編輯產生的檔案並開一個 PR。流程如何運作請參閱 [`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)。
:::
