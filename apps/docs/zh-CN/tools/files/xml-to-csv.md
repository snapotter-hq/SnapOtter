---
description: "从 XML 中提取重复元素并生成 CSV 表格。"
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 2df6bee653a3
---

# XML to CSV {#xml-to-csv}

从 XML 文件中提取重复元素，生成扁平的 CSV 表格。该工具会自动找到 XML 树中的第一个对象数组，并将每个元素映射为一行。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

接受包含 XML 文件的 multipart 表单数据。无需 settings 字段。

## Parameters {#parameters}

此工具没有可配置的参数。重复元素会从 XML 结构中自动检测。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- 仅接受 `.xml` 文件作为输入。
- 该工具会扫描 XML 树以找到第一组重复的同级元素，并将它们用作行。
- 每个唯一的子元素或属性名会成为一个 CSV 列标题。
- 这是一个单向转换。若需 JSON/XML 双向转换，请使用 [JSON to XML](/zh-CN/tools/files/json-xml) 工具。
