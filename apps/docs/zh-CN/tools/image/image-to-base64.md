---
description: "将图像转换为 base64 data URI，以便嵌入 HTML、CSS 等。"
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 0af37698b3a1
---

# 图像转 Base64 {#image-to-base64}

将一个或多个图像转换为 base64 编码的字符串和 data URI。支持可选的格式转换、质量控制和调整大小。适用于将图像直接嵌入 HTML、CSS、JSON 或电子邮件模板。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

接受包含一个或多个图像文件的 multipart 表单数据，以及一个可选的 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| outputFormat | string | 否 | `"original"` | 编码前转换：`original`、`jpeg`、`png`、`webp`、`avif`、`jxl` |
| quality | number | 否 | `80` | 有损格式的输出质量（1 到 100） |
| maxWidth | number | 否 | `0` | 最大宽度（像素，0 = 不调整大小，不会放大） |
| maxHeight | number | 否 | `0` | 最大高度（像素，0 = 不调整大小，不会放大） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

多个文件：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## 响应示例 {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## 响应字段 {#response-fields}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| results | array | 成功转换的图像 |
| errors | array | 处理失败的图像（含文件名和错误信息） |

### Result 对象 {#result-object}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| filename | string | 原始文件名 |
| mimeType | string | 编码输出的 MIME 类型 |
| width | number | 最终宽度（像素，调整大小后） |
| height | number | 最终高度（像素，调整大小后） |
| originalSize | number | 原始文件大小（字节） |
| encodedSize | number | base64 字符串大小（字节） |
| overheadPercent | number | 相对原始文件的大小差异百分比（正数 = 更大，负数 = 更小） |
| base64 | string | 原始 base64 编码的图像数据 |
| dataUri | string | 可直接用于 `src` 属性的完整 data URI |

## 说明 {#notes}

- 与二进制文件相比，Base64 编码通常会使大小增加约 33%。`overheadPercent` 字段显示了实际差异。
- 当 `outputFormat` 为 `"original"` 时，HEIC/HEIF 文件会被转换为 JPEG（因为浏览器无法在 data URI 中显示 HEIC）。
- `maxWidth` 和 `maxHeight` 选项使用 `fit: inside` 配合 `withoutEnlargement` 进行调整大小，因此小于指定尺寸的图像不会被放大。
- 单个请求中可处理多个文件。每个文件独立处理，失败不会影响其他文件成功。
- SVG 文件会作为 `image/svg+xml` 直接传递而不重新编码（除非请求了格式转换）。
- 这是一个只读端点。它不会生成可下载文件或 `jobId`。base64 数据会直接在响应体中返回。
