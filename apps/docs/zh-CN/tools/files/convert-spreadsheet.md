---
description: "在 Excel、OpenDocument 和 CSV 格式之间转换。"
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: f5e2878625a5
---

# Convert Spreadsheet {#convert-spreadsheet}

在 Excel（XLSX）、OpenDocument 电子表格（ODS）和 CSV 格式之间转换电子表格。多工作表工作簿在转换为 CSV 时会导出第一个工作表。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

接受包含 Excel/ODS/CSV 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 输出格式：`xlsx`、`ods`、`csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

返回 `202 Accepted`。通过 `/api/v1/jobs/{jobId}/progress` 处的 SSE 跟踪进度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的输入格式：`.xlsx`、`.xls`、`.ods`、`.csv`。
- 将多工作表工作簿转换为 CSV 时，只导出第一个工作表。
- 公式会被求值，并在 CSV 输出中导出为静态值。
- 输出格式必须与输入格式不同。
