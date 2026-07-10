---
description: "在 JSON 与 XML 之间双向转换。"
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 14f0fbc75e67
---

# JSON to XML {#json-to-xml}

在 JSON 与 XML 格式之间双向转换。上传 JSON 文件可得到 XML，或上传 XML 文件可得到 JSON。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

接受包含 JSON 或 XML 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | 以带缩进的方式美化输出 |

## Example Request {#example-request}

JSON 转 XML：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML 转 JSON：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- 转换方向根据输入文件扩展名自动检测：`.json` 生成 `.xml`，而 `.xml` 生成 `.json`。
- `pretty` 参数对两个方向都适用。当为 `false` 时，输出为紧凑且无缩进的格式。
- 在往返转换过程中，XML 属性和嵌套结构会尽可能被保留。
