---
description: "为 PDF 的每一页添加文本水印。"
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 8e4059b14f27
---

# Watermark PDF {#watermark-pdf}

在 PDF 的每一页上盖印文本水印，位置、大小、不透明度和旋转角度均可配置。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 水印文本（1-200 个字符） |
| position | string | No | `"c"` | 页面上的位置：`tl`、`tc`、`tr`、`l`、`c`、`r`、`bl`、`bc`、`br` |
| fontSize | integer | No | `48` | 以点为单位的字号（6-72） |
| opacity | number | No | `0.3` | 水印不透明度（0.05-1） |
| rotation | number | No | `45` | 以度为单位的旋转角度（-180 到 180） |

### Position Values {#position-values}

- `tl` 左上，`tc` 顶部居中，`tr` 右上
- `l` 中部靠左，`c` 居中，`r` 中部靠右
- `bl` 左下，`bc` 底部居中，`br` 右下

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
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

- 水印以文本叠加层的形式渲染在每一页上。
- 相同的水印文本、位置和样式会统一应用到所有页面。
- 对于不遮挡内容的低调水印，请使用较低的不透明度值（0.1-0.3）。
