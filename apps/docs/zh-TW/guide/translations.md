---
description: "SnapOtter 支援的 21 種語言，以及如何使用 TypeScript 強制驗證的 i18n 系統來建立或改善翻譯。"
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 24087ff1565b
---

# 翻譯指南 {#translation-guide}

SnapOtter 開箱即支援 21 種語言。i18n 系統採用一套輕量的自訂執行環境，具備 TypeScript 強制驗證的語系完整性與動態程式碼分割。

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

1. **使用者偏好** - 儲存在 `localStorage("snapotter-locale")`，並在已驗證登入時同步到使用者設定
2. **瀏覽器自動偵測** - 以 BCP 47 前綴比對走訪 `navigator.languages` 陣列
3. **執行個體預設值** - 管理員的 `DEFAULT_LOCALE` 環境變數（從 `GET /api/v1/config/locale` 擷取）
4. **英文備援** - 永遠可用

使用者可從下列位置切換語言：
- **頁尾的地球圖示選擇器**（桌面版，永遠可見）
- **登入頁**的語言選擇器（驗證前）
- **Settings > General** 區段（每位使用者的偏好設定）
- **行動版側邊欄**的語言下拉選單
- **Settings > System** 區段設定整個執行個體的預設值（僅限管理員）

## 翻譯的運作方式 {#how-translations-work}

所有 UI 字串都存放在 `packages/shared/src/i18n/`。參考檔案是 `en.ts`，它匯出一個具型別的物件，包含應用程式使用的每個字串（約 1500 個鍵）。其他語言則是各自獨立的檔案（例如 `de.ts`、`fr.ts`），匯出相同的結構。

`TranslationKeys` 型別使用 `DeepStringRecord` 來接受任何字串值，同時強制驗證鍵結構。TypeScript 會在編譯時期抓出任何翻譯檔中缺少的鍵。

執行階段只會透過動態 `import()` 載入目前使用中的語系，讓主套件保持精簡。

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

我們歡迎你直接提交翻譯 PR。你可以改善既有語系，也可以新增一種語言。

若你想回報誤譯而不提交程式碼，請開一個 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)，附上語言、錯誤字串以及建議的修正。

::: tip 
翻譯 PR 不需要事先核准。Fork 儲存庫、進行修改，然後開一個 PR。完整的 PR 流程與 CLA 需求請參閱 [貢獻指南](/zh-TW/guide/contributing)。
:::

## 如何建立或更新翻譯 {#how-to-create-or-update-a-translation}

### 1. Fork 並 clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 複製參考檔案（僅限新語言）{#_2-copy-the-reference-file-new-language-only}

若你是在改善既有翻譯，請略過此步驟。

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. 翻譯字串 {#_3-translate-the-strings}

開啟你的新檔案，翻譯每一個字串值。物件結構與鍵必須保持完全一致。

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
- 將 `as const` 保留在結尾
- 從 `./en.js` 匯入 `TranslationKeys` 並為你的匯出加上型別
- 將 `{variable}` 佔位符完全原樣保留
- 陣列（`rotatingPhrases`、`progressMessages`）的項目數量必須相同
- 不要翻譯：SnapOtter、JPEG、PNG、WebP、EXIF、API 及其他技術術語

### 4. 註冊語系（僅限新語言）{#_4-register-the-locale-new-language-only}

將你的語系加入 `packages/shared/src/i18n/index.ts` 中的 `SUPPORTED_LOCALES`：

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

對 `main` 開一個 PR，標題類似 `feat(i18n): add Swedish translation` 或 `fix(i18n): correct German typos`。CLA 機器人會在你首次貢獻時請你簽署。

## 新增翻譯鍵 {#adding-new-translation-keys}

當你新增需要新 UI 字串的功能時：

1. 先將新鍵加入 `en.ts`（參考檔案）
2. 執行 `pnpm typecheck` - 任何缺少新鍵的語系檔案都會失敗
3. 將新鍵加入所有語系檔案（可暫時用英文作為備援）

## 設定 {#configuration}

透過環境變數設定執行個體的預設語言：

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## 檔案參考 {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 英文字串（參考語系，約 1500 個鍵） |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`、`loadTranslations()`、型別匯出 |
| `packages/shared/src/i18n/<locale>.ts` | 各語言的翻譯檔案 |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`、`useTranslation()` hook |
| `apps/web/src/lib/format.ts` | `format()`、`plural()`、`formatFileSize()` 輔助函式 |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 公開端點 |
