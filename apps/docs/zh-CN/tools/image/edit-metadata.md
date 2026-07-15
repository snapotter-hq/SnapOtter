---
description: "编辑图片中的 EXIF、IPTC、GPS 和 XMP 元数据字段，无需重新编码像素。"
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 7b3853980f3b
---

# 编辑图片元数据 {#edit-metadata}

编辑图片的元数据字段，包括 EXIF、IPTC、GPS 坐标、日期和关键词。底层使用 ExifTool，因此元数据是就地写入的，无需重新编码像素，从而完整保留图片质量。

## API 端点 {#api-endpoints}

### 编辑元数据 {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

将元数据字段写入图片并返回修改后的文件。

### 检查元数据 {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

通过 ExifTool 以 JSON 形式返回图片的完整元数据。不会修改图片。

## 参数（编辑） {#parameters-edit}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| title | string | 否 | - | 图片标题（XMP/EXIF） |
| author | string | 否 | - | 作者姓名 |
| artist | string | 否 | - | 艺术家姓名（EXIF Artist 标签） |
| copyright | string | 否 | - | 版权声明 |
| imageDescription | string | 否 | - | 图片描述（EXIF） |
| software | string | 否 | - | 软件标签 |
| dateTime | string | 否 | - | EXIF DateTime 值 |
| dateTimeOriginal | string | 否 | - | EXIF DateTimeOriginal 值 |
| setAllDates | string | 否 | - | 一次性设置所有日期字段 |
| dateShift | string | 否 | - | 按偏移量平移所有日期（格式：`+HH:MM` 或 `-HH:MM`） |
| clearGps | boolean | 否 | `false` | 移除所有 GPS 数据 |
| gpsLatitude | number | 否 | - | 设置 GPS 纬度（-90 至 90） |
| gpsLongitude | number | 否 | - | 设置 GPS 经度（-180 至 180） |
| gpsAltitude | number | 否 | - | 设置 GPS 海拔，单位米 |
| keywords | string[] | 否 | - | 要添加或设置的关键词/标签 |
| keywordsMode | string | 否 | `"add"` | 关键词处理方式：`add`（追加）或 `set`（替换） |
| fieldsToRemove | string[] | 否 | `[]` | 要移除的特定元数据字段名列表 |
| iptcTitle | string | 否 | - | IPTC 对象名称 |
| iptcHeadline | string | 否 | - | IPTC 标题 |
| iptcCity | string | 否 | - | IPTC 城市 |
| iptcState | string | 否 | - | IPTC 省/州 |
| iptcCountry | string | 否 | - | IPTC 国家 |

## 请求示例 {#example-request}

设置作者和版权：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

设置 GPS 坐标：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

移除 GPS 并添加关键词：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

检查元数据：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 响应示例（编辑） {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## 注意事项 {#notes}

- 此工具需要在服务器上安装 ExifTool。Docker 镜像中已包含它。
- 元数据是就地写入的，因此不会发生像素重新编码。文件大小的变化极小（仅为元数据字节）。
- `dateShift` 参数按指定偏移量平移所有日期字段，适用于修正时区错误（例如 `+02:00` 或 `-05:30`）。
- 如果未请求任何更改（所有参数都省略或为空），则原始文件将原样返回。
- 支持的格式：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC/HEIF。
- 对于无法在浏览器中预览的格式（HEIF、TIFF），响应会包含一个 `previewUrl` 字段，附带 WebP 预览。
