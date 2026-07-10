---
description: "使用感知哈希检测重复和近似重复的图像。"
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 2cf60b9dc81a
---

# 查找重复项 {#find-duplicates}

上传多张图像，使用感知哈希（dHash）检测重复和近似重复的图像。将相似图像分组，识别每组中质量最佳的版本，并计算可节省的潜在空间。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

接受包含多个图像文件的 multipart 表单数据，以及一个可选的 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| threshold | number | 否 | `8` | 将图像视为重复项的最大汉明距离（0 到 20）。值越小匹配越严格 |

### 文件字段 {#file-fields}

在 multipart 请求中上传至少 2 个图像文件（全部使用 `file` 字段名，或对文件部分使用任意字段名）。

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## 响应示例 {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## 响应字段 {#response-fields}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| totalImages | number | 成功分析的图像数量 |
| duplicateGroups | array | 重复图像的分组 |
| uniqueImages | number | 不属于任何重复分组的图像数量 |
| spaceSaveable | number | 移除非最佳重复项后可节省的总字节数 |
| skippedFiles | array | 无法处理的文件（含文件名和原因） |

### 重复分组对象 {#duplicate-group-object}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| groupId | number | 分组标识符 |
| files | array | 此重复分组中的图像 |

### 文件对象（分组内） {#file-object-within-a-group}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| filename | string | 原始文件名 |
| similarity | number | 与参考图像（分组中的第一张）的相似度百分比 |
| width | number | 图像宽度（像素） |
| height | number | 图像高度（像素） |
| fileSize | number | 文件大小（字节） |
| format | string | 图像格式 |
| isBest | boolean | 是否为质量最高的版本（像素最多、文件最大） |
| thumbnail | string 或 null | 用于预览的 Base64 JPEG 缩略图（200px 宽） |

## 说明 {#notes}

- 使用 128 位 dHash（64 位行 + 64 位列）进行感知相似度检测。即使经过缩放、重新压缩和轻微编辑，也能识别出重复项。
- 阈值表示两个哈希之间的最大汉明距离。默认值 8 可捕获近似重复项，同时避免误报。使用 0 表示仅识别像素完全相同的图像，使用 15-20 表示非常宽松的匹配。
- 每组中的“最佳”图像是像素最多（宽 x 高）的那张，以文件大小作为决胜依据。
- 至少需要 2 张图像。验证或解码失败的文件会在 `skippedFiles` 中报告，而不会导致整个请求失败。
- 缩略图是编码为 data URI 的 200px 宽 JPEG 预览图。
- 支持所有常见格式（HEIC、RAW、PSD、SVG 会被自动解码）。
