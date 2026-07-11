---
description: "从源图像生成所有标准的 favicon 和应用图标尺寸。"
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: e05c94ba7ba2
---

# Favicon 生成器 {#favicon-generator}

从源图像生成一整套 favicon 和应用图标文件。生成浏览器、Apple 设备和 Android 所需的所有标准尺寸，并附带一个 web manifest 和一段 HTML 代码片段。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/favicon`

接受包含一个或多个图像文件的 multipart 表单数据，以及一个可选的 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| background | string | 否 | - | 背景十六进制颜色（例如 `"#ffffff"`）。设置后，图标会被平整到此颜色上。 |
| padding | integer | 否 | `0` | 图标内容周围的内边距百分比（0 到 40） |
| radius | integer | 否 | `0` | 圆角图标的圆角半径百分比（0 到 50） |
| sizes | integer[] | 否 | - | 将输出限制为指定的像素尺寸（例如 `[16, 32, 180]`）。省略则生成所有标准尺寸。 |
| themeColor | string | 否 | `"#ffffff"` | web manifest 的主题色十六进制值 |

## 生成的文件 {#generated-files}

对于每张输入图像，会生成以下文件：

| 文件 | 尺寸 | 用途 |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | 浏览器标签页图标 |
| `favicon-32x32.png` | 32x32 | 浏览器标签页图标（HiDPI） |
| `favicon-48x48.png` | 48x48 | 桌面快捷方式 |
| `apple-touch-icon.png` | 180x180 | iOS 主屏幕 |
| `android-chrome-192x192.png` | 192x192 | Android 主屏幕 |
| `android-chrome-512x512.png` | 512x512 | Android 启动画面 |
| `favicon.ico` | 32x32 | 传统 ICO 格式 |
| `manifest.json` | - | 带图标引用的 Web 应用 manifest |
| `favicon-snippet.html` | - | 即用型 HTML link 标签 |

## 请求示例 {#example-request}

带圆角和内边距的单个源图像：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

多个源图像（每个都会在子文件夹中获得自己的一套文件）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## 响应示例 {#example-response}

响应是直接流式传输的 ZIP 文件。响应头为：

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## 包含的 HTML 代码片段 {#html-snippet-included}

ZIP 中包含一个 `favicon-snippet.html` 文件，你可以将其粘贴到 HTML 的 `<head>` 中：

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## 说明 {#notes}

- 源图像使用 `cover` 适配模式进行缩放，也就是说会被裁剪以填满每个方形尺寸。为获得最佳效果，请使用方形源图像。
- 上传多个文件时，每个文件都会在 ZIP 中获得自己的子文件夹（以源文件命名）。
- 对于单个文件上传，所有输出都位于 ZIP 的根目录，没有子文件夹。
- 验证或解码失败的文件会被跳过，ZIP 中会包含一个 `skipped-files.txt` 来说明相关问题。
- 支持的输入格式：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、SVG、RAW、PSD 等。
- 在缩放前会自动应用 EXIF 方向信息。
