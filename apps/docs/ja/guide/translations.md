---
description: "SnapOtter がサポートする 21 言語と、TypeScript による完全性が保証された i18n システムを使って翻訳を作成・改善する方法。"
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 152781cc9add
---

# 翻訳ガイド {#translation-guide}

SnapOtter は 21 の言語を標準で同梱しています。i18n システムは軽量なカスタムランタイムを使用しており、ロケールの完全性は TypeScript によって保証され、コードは動的に分割されます。

## サポートされている言語 {#supported-languages}

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

## 言語検出の仕組み {#how-language-detection-works}

SnapOtter は 3 段階の解決順序を使用します:

1. **ユーザー設定** - `localStorage("snapotter-locale")` に保存され、認証済みの場合はユーザー設定に同期されます
2. **ブラウザ自動検出** - BCP 47 のプレフィックス一致で `navigator.languages` 配列を走査します
3. **インスタンスのデフォルト** - 管理者の `DEFAULT_LOCALE` 環境変数（`GET /api/v1/config/locale` から取得）
4. **英語へのフォールバック** - 常に利用可能

ユーザーは次の場所から言語を変更できます:
- **フッターの地球アイコンセレクター**（デスクトップ、常時表示）
- **ログインページ**の言語セレクター（認証前）
- **設定 > 一般** セクション（ユーザーごとの設定）
- **モバイルサイドバー**の言語ドロップダウン
- **設定 > システム** セクションでインスタンス全体のデフォルトを設定（管理者のみ）

## 翻訳の仕組み {#how-translations-work}

すべての UI 文字列は `packages/shared/src/i18n/` にあります。参照ファイルは `en.ts` で、アプリが使用するすべての文字列（約 1500 キー）を持つ型付きオブジェクトをエクスポートします。他の言語は同じ形状をエクスポートする別ファイル（例: `de.ts`、`fr.ts`）です。

`TranslationKeys` 型は `DeepStringRecord` を使用して任意の文字列値を受け入れつつ、キー構造を強制します。TypeScript はコンパイル時にどの翻訳ファイルでも欠落キーを検出します。

実行時には有効なロケールのみが動的 `import()` でロードされるため、メインバンドルは小さく保たれます。

## コンポーネントでの翻訳の使用 {#using-translations-in-components}

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

## 翻訳への貢献 {#contributing-a-translation}

翻訳の PR は直接歓迎します。既存のロケールを改善することも、新しいロケールを追加することもできます。

コードを提出せずに誤訳を報告するには、言語、誤った文字列、および推奨される修正を添えて [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) を開いてください。

::: tip 
翻訳 PR に事前承認は不要です。リポジトリをフォークし、変更を加えて PR を開いてください。PR プロセスの全体と CLA 要件については [コントリビューションガイド](/ja/guide/contributing) を参照してください。
:::

## 翻訳を作成または更新する方法 {#how-to-create-or-update-a-translation}

### 1. フォークしてクローンする {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 参照ファイルをコピーする（新しい言語のみ） {#_2-copy-the-reference-file-new-language-only}

既存の翻訳を改善する場合はこの手順をスキップしてください。

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. 文字列を翻訳する {#_3-translate-the-strings}

新しいファイルを開き、すべての文字列値を翻訳します。オブジェクトの構造とキーは完全に同じに保ってください。

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

ルール:
- オブジェクトのキーは翻訳せず、文字列値のみを翻訳する
- 末尾に `as const` を残す
- `./en.js` から `TranslationKeys` をインポートし、エクスポートに型を付ける
- `{variable}` プレースホルダーはそのまま維持する
- 配列（`rotatingPhrases`、`progressMessages`）は同じ数のエントリを持たなければならない
- 翻訳しないもの: SnapOtter、JPEG、PNG、WebP、EXIF、API、その他の技術用語

### 4. ロケールを登録する（新しい言語のみ） {#_4-register-the-locale-new-language-only}

`packages/shared/src/i18n/index.ts` の `SUPPORTED_LOCALES` にロケールを追加します:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. 検証する {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. 提出する {#_6-submit}

`feat(i18n): add Swedish translation` や `fix(i18n): correct German typos` のようなタイトルで `main` に対して PR を開きます。初回の貢献では CLA ボットが署名を求めます。

## 新しい翻訳キーの追加 {#adding-new-translation-keys}

新しい UI 文字列を必要とする機能を追加する場合:

1. まず `en.ts`（参照ファイル）に新しいキーを追加する
2. `pnpm typecheck` を実行する - 新しいキーが欠落しているすべてのロケールファイルが失敗する
3. すべてのロケールファイルに新しいキーを追加する（一時的なフォールバックとして英語を使用）

## 設定 {#configuration}

環境変数でインスタンスのデフォルト言語を設定します:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## ファイルリファレンス {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 英語文字列（参照ロケール、約 1500 キー） |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`、`loadTranslations()`、型エクスポート |
| `packages/shared/src/i18n/<locale>.ts` | 言語ごとの翻訳ファイル |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`、`useTranslation()` フック |
| `apps/web/src/lib/format.ts` | `format()`、`plural()`、`formatFileSize()` ヘルパー |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 公開エンドポイント |
