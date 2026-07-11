---
description: "在 PowerPoint 和 OpenDocument 演示文稿格式之间转换。"
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 395ff35f7db7
---

# Convert Presentation {#convert-presentation}

在 PowerPoint（PPTX）和 OpenDocument 演示文稿（ODP）格式之间转换演示文稿。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

接受包含 PowerPoint/ODP 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 输出格式：`pptx`、`odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
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
- 转换由服务器上以无头模式运行的 LibreOffice 处理。
- 动画和过渡效果在不同格式之间可能无法保留。
- 输出格式必须与输入格式不同。
