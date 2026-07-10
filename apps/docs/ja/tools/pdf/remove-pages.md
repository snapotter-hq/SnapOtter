---
description: "PDF から特定のページを削除します。"
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 4ac0e482ec3d
---

# Remove Pages {#remove-pages}

残りのページをすべてそのままに保ちながら、PDF から特定のページを削除します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | qpdf 構文で削除するページ範囲。例: `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- ドキュメントからすべてのページを削除することはできません。少なくとも 1 ページは残る必要があります。
- ページ範囲には qpdf 構文を使用します: 単一ページには `3`、範囲には `5-7`、まとめるにはカンマを使います（例: `1,3,5-7`）。
