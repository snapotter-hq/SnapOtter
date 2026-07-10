---
description: "在 CSV 与 Excel（XLSX）之间双向转换。"
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 2f719f0d2613
---

# CSV to Excel {#csv-to-excel}

在 CSV 与 Excel（XLSX）格式之间双向转换。上传 CSV 或 TSV 文件可得到 XLSX，或上传 XLSX 文件可得到 CSV。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

接受包含 CSV、TSV 或 XLSX 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | 从 XLSX 转换时要导出的工作表编号（最小为 1） |

## Example Request {#example-request}

CSV 转 Excel：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel 转 CSV：

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

- 转换方向根据输入文件扩展名自动检测：`.csv` 或 `.tsv` 生成 `.xlsx`，而 `.xlsx` 生成 `.csv`。
- `sheet` 参数仅在从 XLSX 转换时适用。它用于选择要导出的工作表。
- 除 CSV 外，还支持 TSV（制表符分隔值）文件。
