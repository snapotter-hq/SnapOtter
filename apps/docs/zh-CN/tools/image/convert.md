---
description: "在各种格式之间转换图片，包括 AVIF、JXL 和 HEIC 等现代格式。"
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: 238017f07183
---

# 转换图片 {#convert}

在各种格式之间转换图片。支持常见的网页格式，以及 HEIC、JXL、BMP、ICO、JP2、QOI 和 PSD 等专业格式。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/convert`

接受 multipart 表单数据，包含一个图片文件和一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| format | string | 是 | - | 目标格式：`jpg`、`png`、`webp`、`avif`、`tiff`、`gif`、`heic`、`heif`、`jxl`、`bmp`、`ico`、`jp2`、`qoi`、`psd`、`ppm`、`eps`、`tga` |
| quality | number | 否 | - | 输出质量（1-100）。适用于 jpg、webp、avif、heic 等有损格式。 |

## 支持的输出格式 {#supported-output-formats}

| 格式 | 类型 | 说明 |
|--------|------|-------|
| jpg | 有损 | JPEG，兼容性最佳 |
| png | 无损 | 支持透明 |
| webp | 两者 | 现代网页格式，压缩效果好 |
| avif | 有损 | 下一代格式，压缩效果极佳 |
| tiff | 两者 | 印刷/出版工作流 |
| gif | 无损 | 限于 256 种颜色 |
| heic / heif | 有损 | Apple 生态系统格式 |
| jxl | 两者 | JPEG XL，下一代格式 |
| bmp | 无损 | 未压缩位图 |
| ico | 无损 | Windows 图标格式 |
| jp2 | 有损 | JPEG 2000 |
| qoi | 无损 | Quite OK Image 格式 |
| psd | 分层 | Adobe Photoshop（需要 ImageMagick） |
| ppm | 无损 | Portable Pixmap（PPM/PGM/PBM） |
| eps | 矢量 | Encapsulated PostScript |
| tga | 无损 | Targa 图片格式 |

## 请求示例 {#example-request}

转换为 WebP：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

转换为 PNG（无损）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## 注意事项 {#notes}

- 输出文件名的扩展名会自动更新以匹配目标格式。
- SVG 输入在转换前会以 300 DPI 光栅化。
- PSD 转换需要在服务器上安装 ImageMagick。
- BMP、EPS、ICO、JP2、JXL、PPM、QOI 和 TGA 使用专门的 CLI 编码器，并绕过 Sharp 处理。
- HEIC/HEIF 编码使用系统的 HEIC 编码器库。
- 输入格式范围很广：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、RAW（CR2、NEF、ARW 等）、PSD、SVG、BMP 等。
