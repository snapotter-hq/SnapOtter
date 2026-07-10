---
description: "从 PDF 中永久移除指定的文本（经验证的真正涂黑）。"
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: bba620b6691d
---

# Redact PDF {#redact-pdf}

使用经验证的真正涂黑从 PDF 中永久移除指定的文本。被涂黑的文本会从文件中彻底移除，而不仅仅是被黑框覆盖。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | 要涂黑的文本字符串（1-50 个词条，每个最多 200 个字符） |
| caseSensitive | boolean | No | `false` | 匹配是否区分大小写 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 这是一个快速（同步）工具，直接返回结果。
- 这会执行真正的涂黑：匹配到的文本会从 PDF 内容流中移除，而不仅仅是在视觉上遮盖。
- 响应中的 `found` 字段表示涂黑了多少处。
- 单次请求最多可涂黑 50 个词条。
