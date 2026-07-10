---
description: "CSV と Excel（XLSX）を双方向に変換します。"
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 26b6e0a96d6d
---

# CSV to Excel {#csv-to-excel}

CSV と Excel（XLSX）形式を双方向に変換します。CSV または TSV ファイルをアップロードすると XLSX が得られ、XLSX ファイルをアップロードすると CSV が得られます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

CSV、TSV、または XLSX ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | XLSX から変換する際にエクスポートするワークシート番号（最小 1） |

## Example Request {#example-request}

CSV から Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel から CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- 変換方向は入力ファイルの拡張子から自動検出されます。`.csv` または `.tsv` は `.xlsx` を生成し、`.xlsx` は `.csv` を生成します。
- `sheet` パラメータは XLSX から変換する場合にのみ適用されます。どのワークシートをエクスポートするかを選択します。
- TSV（タブ区切り値）ファイルは CSV とともにサポートされます。
