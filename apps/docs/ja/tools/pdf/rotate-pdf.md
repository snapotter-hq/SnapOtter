---
description: "PDF のページを 90、180、または 270 度回転します。"
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 03dac73d3c8a
---

# Rotate PDF {#rotate-pdf}

指定した角度で PDF の全ページまたは選択したページを回転します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | 回転角度: `90`、`180`、または `270` |
| range | string | No | `"1-z"` | qpdf 構文のページ範囲。例: `"1-5,8"`（`"1-z"` = 全ページ） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
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

- 回転は時計回りです。
- ページ範囲には qpdf 構文を使用します: 1〜5 ページには `1-5`、最終ページには `z`、複数の範囲をまとめるにはカンマを使います。
- デフォルトの範囲 `"1-z"` は全ページを回転します。
