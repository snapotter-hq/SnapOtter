---
description: "明示的なページ順を指定して PDF のページを並べ替えます。"
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 7cbb59efd2d9
---

# Organize PDF {#organize-pdf}

希望するページ順を指定して PDF のページを並べ替えます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | qpdf 構文で指定する希望のページ順。例: `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- ページ範囲には qpdf 構文を使用します: `3,1,2` は最初の 3 ページを並べ替え、`5-z` は 5 ページ目から最終ページまでを末尾に追加します。
- ページを複数回列挙すると複製できます（例: `"1,1,2,3"` は 1 ページ目を複製します）。
- order 文字列に列挙されていないページは出力から除外されます。
