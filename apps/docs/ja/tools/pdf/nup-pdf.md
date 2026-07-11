---
description: "1 枚のシートに複数の PDF ページを配置します（2-up、4-up など）。"
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: ae5be144f5e9
---

# N-up PDF {#n-up-pdf}

2-up や 4-up レイアウトのように 1 枚のシートに複数ページを配置し、印刷時の用紙を節約します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | 1 シートあたりのページ数: `2`、`3`、`4`、`8`、`9`、`12`、または `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- ページは読み順（左から右、上から下）に配置されます。
- 出力ページのサイズは元と同じです。各ページはグリッドに収まるよう縮小されます。
- 20 ページのドキュメントに `perSheet: 4` を適用すると、5 ページの出力になります。
