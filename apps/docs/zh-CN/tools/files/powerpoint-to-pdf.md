---
description: "将演示文稿转换为 PDF。"
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 9572e185cb4a
---

# PowerPoint to PDF {#powerpoint-to-pdf}

将 PowerPoint 或 OpenDocument 演示文稿转换为 PDF，每张幻灯片一页。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

接受包含 PowerPoint/ODP 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传一个演示文稿即可将其转换为 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Example Response {#example-response}

返回 `202 Accepted`。通过 `/api/v1/jobs/{jobId}/progress` 处的 SSE 跟踪进度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的输入格式：`.pptx`、`.ppt`、`.odp`。
- 每张幻灯片在 PDF 中成为一页。
- 转换由服务器上以无头模式运行的 LibreOffice 处理。
- 动画和过渡效果不会包含在 PDF 输出中。
