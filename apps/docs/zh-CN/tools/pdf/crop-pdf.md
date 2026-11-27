---
description: "按边距或按区域裁剪 PDF 的所有页面。"
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 103a7d776c7a
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

裁剪 PDF 的所有页面，可以每条边使用同一个边距、每条边使用单独的边距，或裁剪到某个区域，例如打印在纸张一角的快递面单。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides`或`region` |
| margin | number | No | `20` | `uniform` 模式：每条边的裁剪边距，以点为单位（0-2000） |
| top, right, bottom, left | number | No | `0` | `sides` 模式：每条边各自的裁剪边距，以点为单位（0-2000） |
| x, y | number | No | `0` | `region` 模式：区域距页面左边缘和上边缘的偏移，以点为单位 |
| width, height | number | No | `288`, `432` | `region` 模式：区域的大小，以点为单位（4x6 in 的面单） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

只保留每页左上角的 4x6 in 面单：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- 所有值均以 PDF 点为单位（1 点 = 1/72 英寸）。US Letter 页面为 612 x 792 点。
- 每种模式只读取自己的字段，因此只发送 `margin` 的请求仍然可用。
- 区域从每页的左上角开始测量，并且必须容纳在每一页之内。边距必须为每页留下一部分内容。否则请求会失败，并返回 `400`。
- 在设置为旋转显示的页面上，位置和边缘均以页面显示时的样子为准，因此区域的左上角就是旋转后页面的左上角。
- 每种模式都从完整的媒体框开始测量，因此裁剪已裁剪过的页面会从完整页面重新开始。统一边距为 `0` 时会显示整个媒体框。
