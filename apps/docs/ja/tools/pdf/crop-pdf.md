---
description: "PDF の全ページを均一なマージンで切り抜きます。"
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 505c3f006e9a
---

# Crop PDF {#crop-pdf}

均一なマージンを適用して PDF の全ページを切り抜き、各辺から均等にコンテンツをトリミングします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | 均一な切り抜きマージン（ポイント単位、0〜2000） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- マージン値は PDF ポイント単位です（1 ポイント = 1/72 インチ）。
- 同じマージンがすべてのページの 4 辺すべてに適用されます。
- マージンが `0` の場合、既存の切り抜きマージンをすべて削除し、メディアボックス全体を表示します。
