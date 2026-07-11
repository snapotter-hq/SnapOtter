---
description: "ソース画像から標準的なファビコンとアプリアイコンのすべてのサイズを生成します。"
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 86a3fc706791
---

# ファビコンジェネレーター {#favicon-generator}

ソース画像からファビコンとアプリアイコンファイルの完全なセットを生成します。ブラウザ、Apple デバイス、Android に必要なすべての標準サイズを、Web マニフェストと HTML スニペットとともに生成します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/favicon`

1 つ以上の画像ファイルとオプションの JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| background | string | いいえ | - | 背景の 16 進カラー（例: `"#ffffff"`）。設定すると、アイコンはこの色に対してフラット化されます。 |
| padding | integer | いいえ | `0` | アイコンコンテンツの周囲のパディング率（0 から 40） |
| radius | integer | いいえ | `0` | 角丸アイコンの角の半径率（0 から 50） |
| sizes | integer[] | いいえ | - | 特定のピクセルサイズに出力を制限します（例: `[16, 32, 180]`）。すべての標準サイズを生成するには省略します。 |
| themeColor | string | いいえ | `"#ffffff"` | Web マニフェスト用のテーマカラー（16 進） |

## 生成されるファイル {#generated-files}

各入力画像に対して、以下のファイルが生成されます:

| ファイル | サイズ | 用途 |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | ブラウザタブアイコン |
| `favicon-32x32.png` | 32x32 | ブラウザタブアイコン（HiDPI） |
| `favicon-48x48.png` | 48x48 | デスクトップショートカット |
| `apple-touch-icon.png` | 180x180 | iOS ホーム画面 |
| `android-chrome-192x192.png` | 192x192 | Android ホーム画面 |
| `android-chrome-512x512.png` | 512x512 | Android スプラッシュ画面 |
| `favicon.ico` | 32x32 | レガシー ICO 形式 |
| `manifest.json` | - | アイコン参照を含む Web アプリマニフェスト |
| `favicon-snippet.html` | - | すぐに使える HTML link タグ |

## リクエスト例 {#example-request}

角丸とパディングを適用した単一ソース画像:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

複数のソース画像（それぞれがサブフォルダに独自のセットを取得します）:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## レスポンス例 {#example-response}

レスポンスは直接ストリーミングされる ZIP ファイルです。レスポンスヘッダーは以下のとおりです:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## 同梱される HTML スニペット {#html-snippet-included}

ZIP には、HTML の `<head>` に貼り付けられる `favicon-snippet.html` ファイルが含まれています:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## 注記 {#notes}

- ソース画像は `cover` フィットモードでリサイズされます。つまり、各正方形サイズを埋めるようにトリミングされます。最良の結果を得るには、正方形のソース画像を使用してください。
- 複数のファイルがアップロードされた場合、それぞれが ZIP 内に独自のサブフォルダを取得します（ソースファイルにちなんで命名されます）。
- 単一ファイルのアップロードでは、すべての出力がサブフォルダなしで ZIP のルートに配置されます。
- 検証やデコードに失敗したファイルはスキップされ、問題を説明する `skipped-files.txt` が ZIP に含まれます。
- 対応する入力形式: JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、SVG、RAW、PSD など。
- リサイズ前に EXIF の向きが自動的に適用されます。
