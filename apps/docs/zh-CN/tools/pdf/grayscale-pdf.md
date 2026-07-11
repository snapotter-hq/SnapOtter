---
description: "将 PDF 中的所有颜色转换为灰度。"
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 42ba9d288dca
---

# Grayscale PDF {#grayscale-pdf}

将 PDF 中的所有颜色转换为灰度，生成文档的黑白版本。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

接受包含一个 PDF 文件的 multipart 表单数据。无需 `settings` 字段。

## Parameters {#parameters}

此工具没有设置参数。直接上传 PDF 文件即可。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 所有色彩空间（RGB、CMYK）都会转换为灰度，包括嵌入的图像、矢量图形和文本。
- 输出文件通常比原始文件更小，因为灰度数据每像素所需的字节更少。
