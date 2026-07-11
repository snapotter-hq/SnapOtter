---
description: "添加带投影和背景框的样式化文字叠加。"
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: d0640359fbc4
---

# 文字叠加 {#text-overlay}

为图像添加带可选投影和半透明背景框的样式化文字。适用于照片上的标题、说明文字或注释。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

接受包含图像文件和 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 要叠加的文字（1 到 500 个字符） |
| fontSize | number | 否 | `48` | 字体大小（像素，8 到 200） |
| color | string | 否 | `"#FFFFFF"` | 文字颜色，十六进制格式（`#RRGGBB`） |
| position | string | 否 | `"bottom"` | 垂直位置：`top`、`center`、`bottom` |
| backgroundBox | boolean | 否 | `false` | 在文字后显示半透明背景矩形 |
| backgroundColor | string | 否 | `"#000000"` | 背景框颜色，十六进制格式（`#RRGGBB`） |
| shadow | boolean | 否 | `true` | 在文字后应用投影 |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

带背景框：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## 说明 {#notes}

- 文字在图像中始终水平居中。
- 投影使用 2px 偏移、3px 模糊，黑色不透明度为 70%。
- 背景框跨越整个图像宽度，不透明度为 70%，高度与字体大小成比例（1.8 倍）。
- 文字通过 SVG 合成渲染，因此使用系统默认的无衬线字体。
- 文字中的 XML 特殊字符会被安全转义。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
