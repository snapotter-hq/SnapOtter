---
description: "查看详细的图像元数据、属性和各通道直方图统计信息。"
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 7948831b5f0b
---

# 图像信息 {#image-info}

只读分析工具，返回全面的图像元数据，包括尺寸、格式、色彩空间、EXIF/ICC/XMP 是否存在，以及各通道直方图统计信息。不会生成处理后的输出文件。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/info`

接受包含一个图像文件的 multipart 表单数据。无需 settings 字段。

## 参数 {#parameters}

此工具没有可配置参数。只需上传图像文件即可。

| 字段 | 类型 | 是否必填 | 说明 |
|-------|------|----------|-------------|
| file | file | 是 | 要分析的图像 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 响应示例 {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## 响应字段 {#response-fields}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| filename | string | 经过清理的文件名 |
| fileSize | number | 文件大小（字节） |
| width | number | 图像宽度（像素） |
| height | number | 图像高度（像素） |
| format | string | 检测到的格式（jpeg、png、webp 等） |
| channels | number | 色彩通道数 |
| hasAlpha | boolean | 图像是否有 alpha 通道 |
| colorSpace | string | 色彩空间（srgb、cmyk 等） |
| density | number 或 null | DPI/PPI 分辨率 |
| isProgressive | boolean | JPEG 是否使用渐进式编码 |
| orientation | number 或 null | EXIF 方向值（1-8） |
| hasProfile | boolean | 是否嵌入了 ICC 配置文件 |
| hasExif | boolean | 是否存在 EXIF 元数据 |
| hasIcc | boolean | 是否存在 ICC 色彩配置文件 |
| hasXmp | boolean | 是否存在 XMP 元数据 |
| bitDepth | string 或 null | 每样本位数 |
| pages | number | 页数（用于 TIFF、GIF 等多页格式） |
| histogram | array | 各通道统计信息（最小值、最大值、平均值、标准差） |

## 说明 {#notes}

- 这是一个只读端点。它不会生成可下载的输出文件或 `jobId`。
- 对于 RAW 格式图像（DNG、CR2、NEF、ARW 等），会使用 ExifTool 提取 Sharp 无法直接读取的真实传感器尺寸和元数据标志。
- HEIC/HEIF 文件会在内部解码为 PNG 以提取像素统计信息，因为 Sharp 无法解码 HEVC 像素。
- 直方图提供每个通道的最小值/最大值/平均值/标准差，而非完整的 256 桶分布。
- `density` 字段反映嵌入的 DPI 元数据（如果存在）。
