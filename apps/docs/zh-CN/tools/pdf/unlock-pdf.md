---
description: "移除 PDF 的密码保护。"
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 9252b9dbc9fd
---

# Unlock PDF {#unlock-pdf}

通过提供正确的密码来移除加密 PDF 的密码保护。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | 用于解密 PDF 的密码（1-256 个字符） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- 必须提供正确的密码；密码错误会返回 400 错误。
- 用户密码或所有者密码均可用于解密。
- 密码会从审计日志中被隐去。
