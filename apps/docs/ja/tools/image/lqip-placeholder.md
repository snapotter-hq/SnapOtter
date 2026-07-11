---
description: "base64 データ URI を含む、極小の低品質画像プレースホルダーを生成します。"
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: cf7966b1c20b
---

# LQIP プレースホルダー {#lqip-placeholder}

ソース画像から極小の低品質画像プレースホルダー（LQIP）を生成します。すぐに埋め込める base64 データ URI、すぐに使える HTML `<img>` タグ、CSS `background-image` スニペットとともに、小さなプレースホルダーファイルを返します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

画像ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| width | integer | いいえ | `16` | 目標の幅（ピクセル、4〜64） |
| blur | number | いいえ | `2` | ぼかし戦略のぼかし半径（0〜20） |
| strategy | string | いいえ | `"blur"` | プレースホルダー戦略: `blur`、`pixelate`、または `solid` |
| format | string | いいえ | `"webp"` | 出力形式: `webp`、`png`、または `jpeg` |
| quality | integer | いいえ | `50` | 出力品質（1〜100） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## 注記 {#notes}

- `dataUri` フィールドには完全なデータ URI が含まれており、追加のリクエストなしで `src` 属性や CSS ですぐに使用できます。
- `html` と `css` フィールドは、一般的なユースケース向けのコピー&ペースト用スニペットを提供します。
- `blur` 戦略は、柔らかくぼかしたサムネイルを生成します。`pixelate` 戦略は、ブロック状のモザイクを作成します。`solid` 戦略は、単一の平均色を返します。
- 一般的なプレースホルダーサイズは 200〜500 バイトで、HTML に直接インライン化するのに適しています。
- 高さは、ソース画像のアスペクト比を保持するように自動的に計算されます。
- HEIC、RAW、PSD、SVG 入力は、処理前に自動的にデコードされます。
