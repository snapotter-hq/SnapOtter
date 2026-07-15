---
description: "将图像并排、堆叠或以网格方式拼接，可控制对齐、间距、边框和调整模式。"
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 87525c98302e
---

# 拼接合并图片 {#stitch-combine}

将多张图像并排、垂直堆叠或以网格排列的方式拼接。支持对齐、间距、边框、圆角和多种调整模式。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| direction | string | 否 | `"horizontal"` | 布局方向：`horizontal`、`vertical`、`grid` |
| gridColumns | integer | 否 | 2 | 当方向为 `grid` 时的列数（2 到 100） |
| resizeMode | string | 否 | `"fit"` | 图像调整方式：`fit`、`original`、`stretch`、`crop` |
| alignment | string | 否 | `"center"` | 交叉轴对齐：`start`、`center`、`end` |
| gap | number | 否 | 0 | 图像之间的间距（像素，0 到 1000） |
| border | number | 否 | 0 | 外边框宽度（像素，0 到 500） |
| cornerRadius | number | 否 | 0 | 应用于最终输出的圆角（0 到 500） |
| backgroundColor | string | 否 | `"#FFFFFF"` | 背景/边框颜色，十六进制（例如 `#FF0000`） |
| format | string | 否 | `"png"` | 输出格式：`png`、`jpeg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | 90 | 输出质量（1 到 100） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## 说明 {#notes}

- 至少需要 2 张图像。在 multipart 请求中上传多个图像文件。
- 支持 HEIC、RAW、PSD 和 SVG 输入格式（自动解码）。
- 调整模式：
  - `fit` - 沿拼接轴将图像缩放至匹配最小尺寸。
  - `original` - 保持原始尺寸（可能产生不齐的边缘）。
  - `stretch` - 强制图像匹配最小尺寸，不保持宽高比。
  - `crop` - 覆盖裁剪图像以匹配最小尺寸。
- 在 `grid` 模式下，单元格大小设为所有图像尺寸的中位数。
- `cornerRadius` 应用于整个最终输出，而非单张图像。
- 画布大小受 `MAX_CANVAS_PIXELS` 服务器配置限制，以防止内存耗尽。
