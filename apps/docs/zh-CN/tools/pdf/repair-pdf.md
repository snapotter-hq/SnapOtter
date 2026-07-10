---
description: "尝试修复受损或损坏的 PDF。"
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: d4fdbfdb8ca1
---

# Repair PDF {#repair-pdf}

通过重建 PDF 的内部结构来尝试修复受损或损坏的 PDF。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

接受包含一个 PDF 文件的 multipart 表单数据。无需 `settings` 字段。

## Parameters {#parameters}

此工具没有设置参数。直接上传受损的 PDF 文件即可。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- 对输入会跳过结构验证，以允许格式错误的文件通过。
- 修复是尽力而为的；严重损坏的文件可能无法完全恢复。
- 由于重建的交叉引用表，修复后的 PDF 大小可能与原始文件略有不同。
