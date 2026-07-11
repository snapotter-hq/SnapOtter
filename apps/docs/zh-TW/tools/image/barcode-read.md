---
description: "掃描影像中的 QR code、條碼及 2D 碼，並輸出標註影像。"
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 35c373360bd5
---

# Barcode Reader {#barcode-reader}

掃描上傳的影像中所有類型的條碼與 QR code。針對每個偵測到的碼回傳解碼後的文字、條碼類型及位置資料。同時產生一張標註影像，在偵測到的碼周圍加上彩色邊界框。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

接受包含影像檔案及選用 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | 針對較難讀取的條碼啟用積極掃描模式（較慢但更徹底） |

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
| filename | string | 原始檔名 |
| barcodes | array | 偵測到的條碼物件陣列 |
| annotatedUrl | string or null | 下載標註影像的 URL（若未找到條碼則為 null） |
| previewUrl | string or null | 與 annotatedUrl 相同（供前端預覽相容性使用） |

### Barcode Object {#barcode-object}

| Field | Type | Description |
|-------|------|-------------|
| type | string | 條碼格式（QRCode、EAN-13、Code128、DataMatrix、PDF417 等） |
| text | string | 條碼解碼後的內容 |
| position | object | 含 topLeft、topRight、bottomLeft、bottomRight 座標的邊界框 |

## Supported Barcode Types {#supported-barcode-types}

1D 條碼：Code128、Code39、Code93、Codabar、EAN-8、EAN-13、ITF、UPC-A、UPC-E

2D 條碼：QRCode、DataMatrix、PDF417、Aztec、MaxiCode

## Notes {#notes}

- 使用 zxing-wasm 函式庫進行條碼偵測。
- 標註影像會在每個偵測到的條碼上疊加彩色多邊形邊界框及編號標籤。
- 單張影像最多可偵測 255 個條碼。
- 若未找到條碼，`barcodes` 為空陣列，且 `annotatedUrl` 為 null。
- `tryHarder` 模式會以耗費處理時間為代價執行更徹底的掃描。若條碼乾淨、對齊良好，可停用此模式以加快處理。
- 標註輸出一律為 PNG 格式。
- HEIC、RAW、PSD 及 SVG 輸入會在掃描前自動解碼。
- EXIF 方向會在處理前自動套用。
