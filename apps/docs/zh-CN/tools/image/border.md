---
description: "以可预测、可控的顺序为图像添加边框、内边距、圆角和投影。"
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 55125f0d3031
---

# Border & Frame {#border-frame}

为图像添加边框、内边距、圆角和投影。该工具按顺序应用效果：内边距、边框、圆角，然后是阴影。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | 否 | 10 | 边框厚度（像素，0 到 2000） |
| borderColor | string | 否 | `"#000000"` | 边框颜色（十六进制，例如 `#FF0000`） |
| padding | number | 否 | 0 | 图像与边框之间的内边距（像素，0 到 200） |
| paddingColor | string | 否 | `"#FFFFFF"` | 内边距填充颜色（十六进制） |
| cornerRadius | number | 否 | 0 | 圆角半径（像素，0 到 2000） |
| shadow | boolean | 否 | `false` | 是否添加投影 |
| shadowBlur | number | 否 | 15 | 阴影模糊半径（1 到 200） |
| shadowOffsetX | number | 否 | 0 | 阴影水平偏移（-50 到 50） |
| shadowOffsetY | number | 否 | 5 | 阴影垂直偏移（-50 到 50） |
| shadowColor | string | 否 | `"#000000"` | 阴影颜色（十六进制） |
| shadowOpacity | number | 否 | 40 | 阴影不透明度百分比（0 到 100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- 使用标准的 `createToolRoute` 工厂。通过 multipart 上传接受单个图像文件。
- 支持 HEIC、RAW、PSD 和 SVG 输入格式（自动解码）。
- 处理顺序：先添加内边距，然后边框环绕，接着应用圆角，最后合成阴影。
- 当启用 `cornerRadius` 或 `shadow` 时，输出会被强制为 PNG（无论输入格式如何）以保留透明度。支持 alpha 的格式（PNG、WebP、AVIF）保持其原始格式。
- 阴影会感知形状：它会跟随圆角，而不是创建矩形阴影。
- 将 `borderWidth` 设为 0 并仅使用 `cornerRadius` + `shadow`，可创建无框圆角阴影效果。
