---
description: "冊子に折るためにPDFのページを面付けします。"
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 462700920ef6
---

# Booklet PDF {#booklet-pdf}

両面印刷用にページを面付けし、印刷したシートを折って冊子にできるようにします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

PDFファイルとJSON形式の`settings`フィールドを含むmultipartフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | 1シートあたりのページ数: `2`, `4`, `6`, または`8` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- デフォルトの`perSheet: 2`は各シートに2ページを横並びで配置します。これは両面印刷における標準的な冊子レイアウトです。
- 総ページ数がシートサイズの倍数でない場合、空白ページが自動的に追加されます。
- 出力を短辺綴じで両面印刷し、折ってホチキス留めしてください。
