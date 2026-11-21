---
description: "PDF を Markdown に変換し、PDF にある見出し、リスト、表を保持します。"
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 87ffe5323a20
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

PDF を Markdown ファイルに変換します。wiki、静的サイト、LLM パイプラインにそのまま使えます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

PDF ファイルを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。PDF をアップロードすると `.md` ファイルが返されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

大きな PDF は同期ウィンドウを超えることがあります。その場合、API は `202` と `jobId` を返し、進捗は `/api/v1/jobs/{jobId}/progress` で確認できます。

## What gets kept {#what-gets-kept}

PDF は構造ではなく位置付きのテキストを保存しているため、変換時に構造を推定します。

- **見出し。** 本文より明らかに大きい短い行は `#` から `######` の見出しになり、文書全体でのサイズ順にランク付けされます。
- **リスト。** 箇条書き記号または数字で始まる行はリスト項目になります。
- **太字、斜体、リンク。** インラインで保持されます。保持されるリンクは `http`、`https`、`mailto` のみです。
- **表。** 罫線で描かれた表は Markdown の表として出力されます。余白だけで整えた表は、通常は普通の段落になります。

画像は破棄されます。複数段組みや特殊なページデザインはベストエフォートのため、使用前に出力を確認してください。

## Notes {#notes}

- 受け付ける入力形式: `.pdf`。
- レスポンスの `chars` フィールドは、Markdown 出力の長さです。
- スキャンされた PDF には変換できるテキストレイヤーがありません。このツールは空のファイルを返さず、`422` とコード `NO_TEXT_LAYER` で拒否します。その場合は [PDF OCR](./ocr-pdf) ツールを使ってください。
- 往復変換には [Markdown to PDF](../files/markdown-to-pdf)、[Markdown to DOCX](../files/markdown-to-docx)、[Markdown to HTML](../files/markdown-to-html) を使えます。これらは `.md` ファイルを読み込みます。
