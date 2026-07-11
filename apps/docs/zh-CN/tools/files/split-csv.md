---
description: "按行数将 CSV 拆分为更小的文件。"
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 16272439ccb6
---

# Split CSV {#split-csv}

按行数将大型 CSV 或 TSV 文件拆分为更小的文件。返回一个包含各部分的 ZIP 归档。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

接受包含 CSV 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | 否 | `1000` | 每个输出文件的数据行数（1-1,000,000） |
| keepHeader | boolean | 否 | `true` | 在每个输出文件中重复标题行 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes {#notes}

- 输出始终是一个包含拆分后 CSV 各部分的 ZIP 归档，按顺序命名（例如 `part-1.csv`、`part-2.csv`）。
- 当 `keepHeader` 为 `true` 时，每部分都包含原始标题行，因此每个文件都可以独立使用。
- CSV 和 TSV 文件都被接受为输入。
- 行数仅指数据行；标题行不计入其中。
