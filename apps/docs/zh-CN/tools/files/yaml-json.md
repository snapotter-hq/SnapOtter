---
description: "在 YAML 与 JSON 之间双向转换。"
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: 6a8b52e9fe79
---

# 转换 YAML / JSON {#yaml-json}

在 YAML 与 JSON 格式之间双向转换。上传 YAML 文件可得到 JSON，或上传 JSON 文件可得到 YAML。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

接受包含 YAML 或 JSON 文件的 multipart 表单数据。无需 settings 字段。

## Parameters {#parameters}

此工具没有可配置的参数。转换方向由输入文件的扩展名决定。

## Example Request {#example-request}

YAML 转 JSON：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON 转 YAML：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes {#notes}

- 转换方向会从输入文件的扩展名自动检测：`.yaml` 或 `.yml` 生成 `.json`，而 `.json` 生成 `.yaml`。
- `.yaml` 和 `.yml` 两种扩展名都被接受。
- 在多文档 YAML 文件中，仅转换第一个文档；由 `---` 分隔的其他文档会被忽略。
