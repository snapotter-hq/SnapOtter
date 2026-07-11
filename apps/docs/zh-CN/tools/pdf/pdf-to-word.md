---
description: "将 PDF 转换为 Word 文档（DOCX）。"
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 2fc4c695a99e
---

# PDF to Word {#pdf-to-word}

将基于文本的 PDF 转换为 Word 文档（DOCX）。最适合具有可选择文本的 PDF；扫描页面需要先进行 OCR。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

接受包含一个 PDF 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置参数。上传 PDF，它将被转换为 DOCX。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

返回 `202 Accepted`。通过 SSE 在 `/api/v1/jobs/{jobId}/progress` 跟踪进度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 对基于文本的 PDF 效果最佳。扫描页或纯图像页会生成空的或极少的输出；请先使用 [PDF OCR](./ocr-pdf) 添加文本层。
- 转换由服务器上无头运行的 LibreOffice 处理。
- 复杂版式（多栏、重叠元素）可能无法完美转换。
