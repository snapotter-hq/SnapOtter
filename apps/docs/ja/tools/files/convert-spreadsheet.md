---
description: "Excel、OpenDocument、CSV の各形式間で変換します。"
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: da76438c661c
---

# Convert Spreadsheet {#convert-spreadsheet}

スプレッドシートを Excel（XLSX）、OpenDocument Spreadsheet（ODS）、CSV の各形式間で変換します。複数シートのブックは、CSV に変換する際に最初のシートをエクスポートします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Excel／ODS／CSV ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 出力形式: `xlsx`、`ods`、`csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

`202 Accepted` を返します。`/api/v1/jobs/{jobId}/progress` の SSE で進捗を追跡します。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 受け付ける入力形式: `.xlsx`、`.xls`、`.ods`、`.csv`。
- 複数シートのブックを CSV に変換する場合、最初のシートのみがエクスポートされます。
- 数式は評価され、CSV 出力では静的な値としてエクスポートされます。
- 出力形式は入力形式と異なる必要があります。
