---
description: "为 PDF 添加带 AES-256 加密的密码保护。"
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: a3a9f913be85
---

# Protect PDF {#protect-pdf}

使用 AES-256 加密为 PDF 添加密码保护。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | 打开 PDF 所需的密码（1-256 个字符） |
| ownerPassword | string | No | 与 `userPassword` 相同 | 用于权限控制的所有者密码（1-256 个字符） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- 加密使用 AES-256。
- 如果省略 `ownerPassword`，则默认为与 `userPassword` 相同的值。
- 密码会从审计日志中被隐去。
- 加密后的 PDF 需要用户密码才能打开，需要所有者密码（如果不同）才能获得完整权限。
