---
description: "サポートされている21言語と、TypeScriptで整合性が保証されたi18nシステムを使ってSnapOtterの翻訳を作成・改善する方法。"
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 58b093c7f100
---

# 翻訳ガイド {#translation-guide}

SnapOtterは最初から21言語を同梱しています。i18nシステムは軽量なカスタムランタイムを使い、TypeScriptによってロケールの完全性を保証し、コードを動的に分割します。

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

SnapOtterは3段階の解決順序を使います。

1. **ユーザー設定** - `localStorage("snapotter-locale")` に保存され、認証済みの場合はユーザー設定に同期されます
2. **ブラウザ自動検出** - `navigator.languages` 配列をBCP 47のプレフィックス一致でたどります
3. **インスタンスの既定値** - 管理者の `DEFAULT_LOCALE` 環境変数（`GET /api/v1/config/locale` から取得）
4. **英語へのフォールバック** - 常に利用可能

ユーザーは次の場所から言語を変更できます。
- **フッターの地球儀セレクター**（デスクトップ、常に表示）
- **ログインページ**の言語セレクター（認証前）
- **設定 > 一般** セクション（ユーザーごとの設定）
- **モバイルサイドバー**の言語ドロップダウン
- **設定 > システム** セクションはインスタンス全体の既定値を設定します（管理者のみ）

## 翻訳の仕組み {#how-translations-work}

すべてのUI文字列は `packages/shared/src/i18n/` にあります。参照ファイルは `en.ts` で、アプリが使用するすべての文字列（約1500キー）を型付きオブジェクトとしてエクスポートします。他の言語は同じ形状をエクスポートする別ファイル（例: `de.ts`、`fr.ts`）です。

`TranslationKeys` 型は `DeepStringRecord` を使い、キー構造を強制しつつ任意の文字列値を受け入れます。TypeScriptはどの翻訳ファイルでも欠落したキーをコンパイル時に検出します。

実行時には動的な `import()` によってアクティブなロケールのみが読み込まれ、メインバンドルを小さく保ちます。

## コンポーネントでの翻訳の使い方 {#using-translations-in-components}

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

翻訳のPRは直接歓迎します。既存のロケールを改善することも、新しいロケールを追加することもできます。

コードを提出せずに誤訳を報告するには、言語、誤った文字列、修正案を添えて [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) を作成してください。

::: tip 
翻訳のPRに事前の承認は不要です。リポジトリをフォークして変更を加え、PRを作成してください。PRの手順全体とCLA要件については [Contributing Guide](/ja/guide/contributing) を参照してください。
:::

## 翻訳を作成または更新する方法 {#how-to-create-or-update-a-translation}

### 1. フォークしてクローン {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 参照ファイルをコピー（新しい言語のみ） {#_2-copy-the-reference-file-new-language-only}

既存の翻訳を改善する場合はこの手順を省略してください。

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. 文字列を翻訳 {#_3-translate-the-strings}

新しいファイルを開き、すべての文字列値を翻訳します。オブジェクトの構造とキーはまったく同じままにしてください。

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
- オブジェクトのキーは翻訳せず、文字列値のみを翻訳します
- `as const` は末尾に残します
- `./en.js` から `TranslationKeys` をインポートし、エクスポートに型を付けます
- `{variable}` のプレースホルダーはそのまま残します
- 配列（`rotatingPhrases`、`progressMessages`）はエントリ数を同じにしてください
- 翻訳しないもの: SnapOtter、JPEG、PNG、WebP、EXIF、API、その他の技術用語

### 4. ロケールを登録（新しい言語のみ） {#_4-register-the-locale-new-language-only}

`packages/shared/src/i18n/index.ts` の `SUPPORTED_LOCALES` にロケールを追加します。

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. 検証 {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. 提出 {#_6-submit}

`main` に対して、`feat(i18n): add Swedish translation` や `fix(i18n): correct German typos` のようなタイトルでPRを作成します。初回の貢献では、CLAボットが署名を求めます。

## 新しい翻訳キーの追加 {#adding-new-translation-keys}

新しいUI文字列を必要とする機能を追加するとき:

1. まず `en.ts`（参照ファイル）に新しいキーを追加します
2. `pnpm typecheck` を実行します。新しいキーが欠けているロケールファイルはすべて失敗します
3. すべてのロケールファイルに新しいキーを追加します（一時的なフォールバックとして英語を使用します）

## 設定 {#configuration}

環境変数でインスタンスの既定言語を設定します。

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## ファイルリファレンス {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 英語の文字列（参照ロケール、約1500キー） |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`、`loadTranslations()`、型のエクスポート |
| `packages/shared/src/i18n/<locale>.ts` | 言語ごとの翻訳ファイル |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`、`useTranslation()` フック |
| `apps/web/src/lib/format.ts` | `format()`、`plural()`、`formatFileSize()` ヘルパー |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 公開エンドポイント |

## ウェブサイト、ドキュメント、APIリファレンスの翻訳 {#translating-the-web-surfaces}

上記の21言語サポートは**アプリ**を対象としています。公開ウェブサイト（snapotter.com）、このドキュメントサイト、REST APIリファレンスも、別のハッシュゲート方式のパイプラインによって21言語すべてに翻訳されます。このパイプラインは `packages/shared/src/i18n` の同じツール名と説明を再利用するため、用語がどこでも一貫します。

### 既定では機械翻訳 {#machine-translated-by-default}

ウェブサイトとドキュメントの英語以外のすべてのページは、最初のパスで**機械翻訳**され（サードパーティのサービスではなく、Claude Codeのセッションによって）、その旨を示す小さく閉じられるバナーが表示され、ここへのリンクが付きます。これは意図的なものです。21言語すべてを迅速かつ正直に提供し、その上で最も重要なページをコミュニティが磨き上げることを促します。機械翻訳は意味を伝え、人間のレビューで自然に読めるようになります。

### パイプラインが何を翻訳するかを決める仕組み {#how-the-web-pipeline-decides}

翻訳可能な英語ソースの各ユニットはハッシュ化され、そのハッシュが翻訳の隣に保存されます。各実行でパイプラインは次のことを行います。

- まだ翻訳のないユニットを翻訳します
- 保存されたハッシュが依然として英語ソースと一致するユニットはスキップします
- 英語ソースが変わった**機械**ユニットを再翻訳します
- そして、**人間**が磨いたユニットは、英語ソースが変わったときにあなたの作業を上書きするのではなく、`stale`（要レビュー）としてフラグを立てます

### PRでウェブ翻訳を磨く {#refining-a-web-translation-by-pr}

ウェブサイト、ドキュメント、APIリファレンスの翻訳は、アプリのロケールを改善するのと同じ方法で改善します。生成されたファイルを編集してPRを作成するだけです。

1. あなたの言語の生成済み翻訳を見つけます:
   - ウェブサイトのUI文字列: `apps/landing/src/i18n/<locale>.json`
   - ドキュメントページ: `apps/docs/<locale>/**.md`
   - APIリファレンス: `apps/api/src/openapi.<locale>.yaml`
2. テキストを編集します。コード、リンク、`{placeholders}`、および `⸤I18N…⸥` マーカーはそのままに保ってください。パイプラインのバリデーターは、これらを削除または並べ替えた翻訳を拒否します。
3. PRを作成します。ユニットを編集すると、その来歴が `machine` から `human` に切り替わるため、後の実行でパイプラインが**それを上書きすることは決してありません**。その後で英語ソースが変わった場合、あなたのユニットは無言で置き換えられるのではなく、レビュー対象として `stale` のフラグが立てられます。

コードを提出せずに誤訳を報告するには、ページのURL、言語、誤ったテキスト、修正案を添えて [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) を作成してください。

::: tip 
メンテナーが翻訳パイプラインを実行するので、貢献にAPIキーは必要ありません。生成されたファイルを編集してPRを作成するだけです。パイプラインの実行方法については [`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md) を参照してください。
:::