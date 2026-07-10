---
description: "将多个列一致的 CSV 或 TSV 文件合并为一个。"
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 474eeae6471f
---

# Merge CSVs {#merge-csvs}

将多个 CSV 或 TSV 文件合并为单个文件。所有输入文件必须具有相同的列标题。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

接受包含两个或更多 CSV 文件的 multipart 表单数据。无需 settings 字段。

## Parameters {#parameters}

此工具没有可配置的参数。上传 2 到 20 个列标题一致的 CSV 或 TSV 文件。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- 需要 2 到 20 个输入文件。
- 所有文件必须共享相同的列标题。如果列不匹配，合并将失败。
- 标题行在输出中只包含一次；来自所有文件的数据行按上传顺序拼接。
- CSV 和 TSV 文件都被接受，但单个请求中的所有文件应使用相同的分隔符。
