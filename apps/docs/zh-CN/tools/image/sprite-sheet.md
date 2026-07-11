---
description: "将多张图像合并为单个精灵表网格，并附带帧元数据。"
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: d9d3dc08d26a
---

# 精灵表 {#sprite-sheet}

将多张图像合并为单个精灵表网格。每张图像会被调整为与第一张图像相同的尺寸并放入网格中。返回精灵表图像以及每帧的坐标元数据。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

接受包含两张或更多图像文件以及 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| columns | integer | 否 | `4` | 网格中的列数（1-16） |
| padding | integer | 否 | `0` | 单元格之间的间距（像素，0-64） |
| background | string | 否 | `"#ffffff"` | 背景十六进制颜色 |
| format | string | 否 | `"png"` | 输出格式：`png`、`webp` 或 `jpeg` |
| quality | integer | 否 | `90` | 输出质量（1-100） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## 说明 {#notes}

- 接受 2 到 64 张图像。所有图像都会被调整为与第一张上传图像相同的尺寸。
- `frames` 数组提供输出中每一帧的精确像素坐标，适用于 CSS 精灵定义或游戏引擎帧图。
- 行数根据图像数量和 `columns` 值自动计算。
- 使用 `padding` 参数在单元格之间添加间距。`background` 颜色会显示在内边距区域以及任何末尾的空单元格中。
- HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
