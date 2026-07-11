---
description: "添加文字水印，可配置位置、不透明度、旋转和平铺。"
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 471457a79ffa
---

# 文字水印 {#text-watermark}

为图像添加文字水印叠加。支持在角落/中心的单个位置放置，或在整幅图像上平铺重复，可配置字体大小、颜色、不透明度和旋转。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

接受包含图像文件和 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 水印文字（1 到 500 个字符） |
| fontSize | number | 否 | `48` | 字体大小（像素，8 到 1000） |
| color | string | 否 | `"#000000"` | 文字颜色，十六进制格式（`#RRGGBB`） |
| opacity | number | 否 | `50` | 文字不透明度百分比（0 到 100） |
| position | string | 否 | `"center"` | 位置：`center`、`top-left`、`top-right`、`bottom-left`、`bottom-right`、`tiled` |
| rotation | number | 否 | `0` | 文字旋转角度（度，-360 到 360） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

在整幅图像上平铺的水印：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## 说明 {#notes}

- 水印以 SVG 文字形式渲染并合成到图像上，保持输出质量。
- 平铺模式根据字体大小设置文字元素的间距（水平 6 倍、垂直 4 倍间距），最多 500 个元素。
- 对于角落位置，距边缘的内边距等于字体大小。
- 使用的字体是系统默认的无衬线字体。
- 文字中的 XML 特殊字符（`&`、`<`、`>`、`"`、`'`）会被安全转义。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
