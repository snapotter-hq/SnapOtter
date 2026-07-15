---
description: "使用 25 多种模板将多张图片合成为网格拼贴，可调整间距与圆角，并支持逐单元格平移与缩放。"
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: a4e5c1913881
---

# 拼贴和网格 {#collage-grid}

使用 25 多种模板将多张图片合成为精美的网格拼贴。支持 2-9 张图片的布局，可自定义间距、圆角半径、背景颜色，以及逐单元格的平移/缩放控制。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/collage`

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| templateId | string | 是 | - | 模板布局 ID（例如 `2-h-equal`、`3-left-large`、`4-grid`、`9-grid`） |
| cells | array | 否 | - | 逐单元格设置数组，包含 `imageIndex`、`panX`、`panY`、`zoom`、`objectFit` |
| cells[].imageIndex | integer | 是 | - | 放置到该单元格中的图片索引（从 0 开始） |
| cells[].panX | number | 否 | 0 | 水平平移偏移（-100 至 100） |
| cells[].panY | number | 否 | 0 | 垂直平移偏移（-100 至 100） |
| cells[].zoom | number | 否 | 1 | 缩放级别（1 至 10） |
| cells[].objectFit | string | 否 | `"cover"` | 图片填充单元格的方式：`cover` 或 `contain` |
| gap | number | 否 | 8 | 单元格之间的间距，单位像素（0 至 500） |
| cornerRadius | number | 否 | 0 | 每个单元格的圆角半径，单位像素（0 至 500） |
| backgroundColor | string | 否 | `"#FFFFFF"` | 背景颜色，十六进制或 `"transparent"` |
| aspectRatio | string | 否 | `"free"` | 画布宽高比：`free`、`1:1`、`4:3`、`3:2`、`16:9`、`9:16`、`4:5` |
| outputFormat | string | 否 | `"png"` | 输出格式：`png`、`jpeg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | 90 | 输出质量（1 至 100） |

## 可用模板 {#available-templates}

| 模板 ID | 图片数 | 布局 |
|-------------|--------|--------|
| `2-h-equal` | 2 | 两列等宽 |
| `2-v-equal` | 2 | 两行等高 |
| `2-h-left-large` | 2 | 左侧 2/3，右侧 1/3 |
| `2-h-right-large` | 2 | 左侧 1/3，右侧 2/3 |
| `3-left-large` | 3 | 左侧大图，右侧上下两张 |
| `3-right-large` | 3 | 左侧上下两张，右侧大图 |
| `3-top-large` | 3 | 上方大图，下方两列 |
| `3-h-equal` | 3 | 三列等宽 |
| `3-v-equal` | 3 | 三行等高 |
| `4-grid` | 4 | 2x2 网格 |
| `4-left-large` | 4 | 左侧大图，右侧上下三张 |
| `4-top-large` | 4 | 上方大图，下方三列 |
| `4-bottom-large` | 4 | 上方三列，下方大图 |
| `5-top2-bottom3` | 5 | 上方两张，下方三张 |
| `5-top3-bottom2` | 5 | 上方三张，下方两张 |
| `5-left-large` | 5 | 左侧大图，右侧上下四张 |
| `5-center-large` | 5 | 中央大图，四角环绕 |
| `6-grid-2x3` | 6 | 2 列 x 3 行 |
| `6-grid-3x2` | 6 | 3 列 x 2 行 |
| `6-top-large` | 6 | 上方大图，下方五列 |
| `7-mosaic` | 7 | 马赛克布局 |
| `8-mosaic` | 8 | 马赛克布局 |
| `9-grid` | 9 | 3x3 网格 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## 注意事项 {#notes}

- 在 multipart 请求中上传多个图片文件。图片按上传顺序分配到模板单元格。
- 如果上传的图片数量超过模板支持的数量，多余的图片会被忽略。
- 支持 HEIC、RAW、PSD 和 SVG 输入格式（自动解码）。
- 画布基础尺寸为最长边 2400px，并按所选宽高比缩放。
- 当 `aspectRatio` 为 `"free"` 时，画布默认为 4:3（2400x1800）。
- 逐单元格的 `panX`/`panY` 值会在单元格内移动裁剪窗口。值为 100 时完全移向一侧边缘，-100 则移向另一侧。
- `"transparent"` 背景颜色仅在 `png`、`webp` 或 `avif` 输出格式下才会保留。
