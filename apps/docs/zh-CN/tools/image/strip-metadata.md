---
description: "从图像中移除 EXIF、GPS、ICC 和 XMP 元数据，以保护隐私并减小文件大小。"
i18n_source_hash: e89147734fd0
i18n_provenance: human
i18n_output_hash: 0beed818cd0e
---

# 移除元数据 {#remove-metadata}

从图像中移除 EXIF、GPS、ICC 色彩配置文件和 XMP 元数据。适用于保护隐私（移除 GPS 坐标、相机信息）以及减小文件大小。

## API 端点 {#api-endpoints}

### 移除元数据 {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

处理图像并返回移除了所选元数据的清理版本。

### 检查元数据 {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

以 JSON 形式返回解析后的元数据，不修改图像。适用于在移除前预览存在哪些元数据。

## 参数（移除） {#parameters-strip}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | 否 | `false` | 移除 EXIF 数据（相机设置、日期等） |
| stripGps | boolean | 否 | `false` | 仅移除 GPS/位置数据 |
| stripIcc | boolean | 否 | `false` | 移除 ICC 色彩配置文件 |
| stripXmp | boolean | 否 | `false` | 移除 XMP 元数据（Adobe、IPTC） |
| stripAll | boolean | 否 | `true` | 一次性移除所有元数据 |

当 `stripAll` 为 `true` 时，它会覆盖各个单独的标志并移除所有内容。

## 示例请求 {#example-request}

移除所有元数据：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

仅移除 GPS 数据（保留相机信息和色彩配置文件）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

检查元数据而不修改：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 示例响应（移除） {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## 示例响应（检查） {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## 说明 {#notes}

- 移除后，图像会以其原始格式重新编码。JPEG 使用 mozjpeg 以质量 90 编码，PNG 使用压缩级别 9，WebP 使用质量 85。
- 如果图像标记了非 sRGB 配置文件，移除 ICC 配置文件可能导致细微的色彩偏移。如果色彩准确性很重要，请使用 `stripIcc: false`。
- 检查端点会将 GPS 坐标解析为十进制的纬度/经度值（以下划线为前缀）以便使用。
- 支持的输入格式：JPEG、PNG、WebP、AVIF、TIFF、GIF。
