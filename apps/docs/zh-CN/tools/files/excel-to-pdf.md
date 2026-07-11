---
description: "将电子表格转换为 PDF。"
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 0493f22917c8
---

# Excel to PDF {#excel-to-pdf}

将 Excel、OpenDocument 或 CSV 电子表格转换为 PDF。较宽的工作表可能会分页到多页。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

接受包含 Excel/ODS/CSV 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传电子表格即可将其转换为 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- 较宽的工作表在生成的 PDF 中可能被拆分到多页。
- 图表和条件格式会在 PDF 输出中渲染。
- 转换由服务器上以无头模式运行的 LibreOffice 处理。
