---
description: "PDF から選択したページを取り出して新しいドキュメントを作成します。"
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: f59fc16a4b29
---

# Extract Pages {#extract-pages}

PDF から選択したページを取り出して、より小さな新しいドキュメントを作成します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | qpdf 構文のページ範囲。例: `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- ページ範囲には qpdf 構文を使用します: 1〜5 ページには `1-5`、最終ページには `z`、複数の範囲をまとめるにはカンマを使います（例: `1-3,7,10-z`）。
- 取り出したページは元の書式、注釈、リンクを保持します。
