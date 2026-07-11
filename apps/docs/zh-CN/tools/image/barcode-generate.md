---
description: "生成 Code 128、EAN-13、UPC-A、Code 39、ITF-14 和 Data Matrix 格式的条形码。"
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 7106840d576a
---

# Barcode Generator {#barcode-generator}

从文本输入生成条形码图像。支持 Code 128、EAN-13、UPC-A、Code 39、ITF-14 和 Data Matrix 格式。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

接受一个 `application/json` 请求体（而非 multipart）。条形码由提供的文本生成，而不是由上传的文件生成。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 要编码到条形码中的文本（1-256 个字符） |
| type | string | 否 | `"code128"` | 条形码格式：`code128`、`ean13`、`upca`、`code39`、`itf14`、`datamatrix` |
| scale | integer | 否 | `3` | 图像缩放系数（1-8） |
| includeText | boolean | 否 | `true` | 是否在条形码下方渲染文本 |

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

- 与大多数工具不同，此端点接受 JSON 请求体而非 multipart 表单数据，因为条形码是从文本生成的，而不是从上传的文件生成的。
- EAN-13 要求恰好 12 或 13 位数字。UPC-A 要求恰好 11 或 12 位数字。如果省略校验位，则会自动计算。
- Code 128 是最灵活的格式，支持完整的 ASCII 字符集。
- Data Matrix 生成二维条形码，适合在紧凑的方形中编码较长的字符串。
