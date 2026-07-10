---
description: "產生 Code 128、EAN-13、UPC-A、Code 39、ITF-14 及 Data Matrix 格式的條碼。"
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 58e94499f352
---

# Barcode Generator {#barcode-generator}

從文字輸入產生條碼影像。支援 Code 128、EAN-13、UPC-A、Code 39、ITF-14 及 Data Matrix 格式。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

接受 `application/json` 主體（非 multipart）。條碼由提供的文字產生，而非上傳的檔案。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 要編碼於條碼中的文字（1-256 個字元） |
| type | string | No | `"code128"` | 條碼格式：`code128`、`ean13`、`upca`、`code39`、`itf14`、`datamatrix` |
| scale | integer | No | `3` | 影像縮放係數（1-8） |
| includeText | boolean | No | `true` | 是否在條碼下方算繪文字 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- 與多數工具不同，此端點接受 JSON 主體，而非 multipart form data，因為條碼是由文字產生，而非由上傳的檔案產生。
- EAN-13 需要恰好 12 或 13 個數字。UPC-A 需要恰好 11 或 12 個數字。若省略檢查碼，系統會自動計算。
- Code 128 是最具彈性的格式，支援完整的 ASCII 字元集。
- Data Matrix 會產生 2D 條碼，適合以緊湊的方形編碼較長的字串。
