---
description: "通过格式转换、质量控制、调整尺寸和剥离元数据来为网页交付优化图片。"
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: ae856b5bebbe
---

# 网页优化 {#optimize-for-web}

一步到位地为网页交付优化图片。整合了格式转换、质量调整、可选的尺寸调整、渐进式编码以及元数据剥离。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

接受包含一个图片文件和一个 JSON `settings` 字段的 multipart 表单数据。

另外还提供实时预览端点 `POST /api/v1/tools/image/optimize-for-web/preview`，它直接以二进制形式返回处理后的图片（不创建工作区），用于实时调整参数。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| format | string | 否 | `"webp"` | 输出格式：`webp`、`jpeg`、`avif`、`png`、`jxl` |
| quality | number | 否 | `80` | 输出质量（1-100） |
| maxWidth | number | 否 | - | 最大宽度（像素）。图片若更宽则会被缩小。 |
| maxHeight | number | 否 | - | 最大高度（像素）。图片若更高则会被缩小。 |
| progressive | boolean | 否 | `true` | 启用渐进式/隔行扫描编码 |
| stripMetadata | boolean | 否 | `true` | 移除 EXIF、GPS、ICC 和 XMP 元数据 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

以激进压缩优化为 AVIF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### 预览端点响应 {#preview-endpoint-response}

预览端点（`/api/v1/tools/image/optimize-for-web/preview`）直接返回二进制图片，并附带信息性响应头：

- `X-Original-Size` - 原始文件大小（字节）
- `X-Processed-Size` - 处理后文件大小（字节）
- `X-Output-Filename` - 经过 URL 编码的输出文件名

## 说明 {#notes}

- 该工具被设计为面向网页资源的一站式优化流水线。它在一次处理中完成格式转换、质量调整、最大尺寸限制和元数据移除。
- 输出文件名的扩展名会更新以匹配所选格式。
- JXL（JPEG XL）编码使用专用的 CLI 编码器。图片会先处理为 PNG，再编码为 JXL。
- 渐进式编码通过让浏览器在完整图片加载之前先渲染低质量预览，改善 JPEG 和 PNG 的感知加载时间。
- 预览端点更为轻量（不创建工作区/任务），旨在供前端的实时参数调整界面使用。
