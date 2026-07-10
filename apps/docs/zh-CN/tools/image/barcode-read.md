---
description: "扫描图像中的二维码、条形码和 2D 码，并输出带标注的结果。"
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: bd849112663a
---

# Barcode Reader {#barcode-reader}

扫描上传图像中的所有类型条形码和二维码。为每个检测到的码返回解码文本、条形码类型和位置数据。还会生成一张带标注的图像，在检测到的码周围绘制彩色边界框。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

接受包含图像文件和一个可选 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | 否 | `true` | 为更难读取的条形码启用激进扫描模式（更慢但更彻底） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Example Response {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | 原始文件名 |
| barcodes | array | 检测到的条形码对象数组 |
| annotatedUrl | string 或 null | 下载带标注图像的 URL（未找到条形码时为 null） |
| previewUrl | string 或 null | 与 annotatedUrl 相同（用于前端预览兼容） |

### Barcode Object {#barcode-object}

| Field | Type | Description |
|-------|------|-------------|
| type | string | 条形码格式（QRCode、EAN-13、Code128、DataMatrix、PDF417 等） |
| text | string | 条形码的解码内容 |
| position | object | 带有 topLeft、topRight、bottomLeft、bottomRight 坐标的边界框 |

## Supported Barcode Types {#supported-barcode-types}

1D 条形码：Code128、Code39、Code93、Codabar、EAN-8、EAN-13、ITF、UPC-A、UPC-E

2D 条形码：QRCode、DataMatrix、PDF417、Aztec、MaxiCode

## Notes {#notes}

- 使用 zxing-wasm 库进行条形码检测。
- 带标注的图像会在每个检测到的条形码上叠加彩色多边形边界框和编号标签。
- 单张图像中最多可检测 255 个条形码。
- 如果未找到条形码，`barcodes` 为空数组，`annotatedUrl` 为 null。
- `tryHarder` 模式以处理时间为代价进行更彻底的扫描。对于干净、对齐良好的条形码，可禁用它以加快处理速度。
- 带标注的输出始终为 PNG 格式。
- HEIC、RAW、PSD 和 SVG 输入在扫描前会自动解码。
- EXIF 方向会在处理前自动应用。
