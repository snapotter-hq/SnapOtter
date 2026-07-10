---
description: "在 CSV 与 JSON 之间双向转换。"
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 96c06a2986a3
---

# CSV to JSON {#csv-to-json}

在 CSV 与 JSON 格式之间双向转换。上传 CSV 或 TSV 文件可得到 JSON 对象数组，或上传 JSON 数组可得到 CSV 文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

接受包含 CSV、TSV 或 JSON 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | 以带缩进的方式美化输出 JSON |

## Example Request {#example-request}

CSV 转 JSON：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON 转 CSV：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- 转换方向根据输入文件扩展名自动检测：`.csv` 或 `.tsv` 生成 `.json`，而 `.json` 生成 `.csv`。
- `pretty` 参数只影响 JSON 输出。设为 `false` 时，输出为紧凑的单行 JSON 字符串。
- JSON 输入必须是键一致的对象数组。每个对象成为一行，每个键成为一个列标题。
- 除 CSV 外，还支持 TSV（制表符分隔值）文件。
