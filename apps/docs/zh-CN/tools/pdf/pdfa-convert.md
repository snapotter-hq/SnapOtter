---
description: "将 PDF 转换为归档用 PDF/A-2 格式以实现长期保存。"
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: 49f702ce85db
---

# PDF/A 转换器 {#pdf-a-convert}

将 PDF 转换为 PDF/A-2 归档格式，适用于长期保存和合规要求。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

接受包含一个 PDF 文件的 multipart 表单数据。无需 `settings` 字段。

## Parameters {#parameters}

此工具没有设置参数。直接上传 PDF 文件即可。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- 输出符合 PDF/A-2 标准。
- PDF/A 会嵌入所有字体并禁止外部引用，因此输出文件可能比原始文件更大。
- 转换过程中会剥离加密和 JavaScript，因为 PDF/A 标准不允许使用它们。
