---
description: "ページを抽出するか、PDF を分割します。"
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 5a3a351a4e10
---

# Split PDF {#split-pdf}

ページ範囲を抽出して新しい PDF にするか、ドキュメントを N ページごとのチャンクに分割します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | 分割モード: `range` または `every` |
| range | string | mode が `range` の場合 | - | qpdf 構文のページ範囲。例: `"1-5,8,10-z"` |
| everyN | integer | mode が `every` の場合 | - | N ページごとのチャンクに分割（1〜500） |

## Example Request {#example-request}

特定のページを抽出する場合:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

10 ページごとのチャンクに分割する場合:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- `range` モードでは、選択したページを含む単一の PDF が返されます。
- `every` モードでは、個々のパートを含む ZIP アーカイブが結果として返されます。
- ページ範囲には qpdf 構文を使用します: 1〜5 ページには `1-5`、最終ページには `z`、複数の範囲をまとめるにはカンマを使います（例: `1-3,7,10-z`）。
