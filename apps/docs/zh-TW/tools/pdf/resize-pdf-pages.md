---
description: "將 PDF 的每一頁調整為 A4、Letter、4x6 in 貨運標籤或自訂尺寸。"
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 31769faa3fd5
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

變更 PDF 中每一頁的頁面尺寸。內容會縮放以符合新頁面並置中，因此文字、向量圖形與條碼都能保持清晰。可用它把貨運標籤轉成適用於熱感式印表機的 4x6 in 頁面，或在 A4 與美國 Letter 之間轉換文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | 目標尺寸：`4x6in`、`100x150mm`、`a4`、`a5`、`a6`、`letter`、`legal` 或 `custom` |
| width | number | No | `4` | 自訂頁面寬度，在 `pageSize` 為 `custom` 時使用 |
| height | number | No | `6` | 自訂頁面高度，在 `pageSize` 為 `custom` 時使用 |
| unit | string | No | `"in"` | 自訂尺寸的單位：`in` 或 `mm` |
| keepOrientation | boolean | No | `false` | 讓目標尺寸隨每頁的方向旋轉，而不是強制固定寬乘高 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- 頁面會依比例縮放以符合，不會被拉伸。長寬比不同時，多出的空間保持空白。
- 調整尺寸不會裁切。印在 Letter 或 A4 頁面四分之一區域的標籤，在新頁面上仍然只占四分之一。
- 自訂尺寸每邊必須介於 0.5-200 in（12.7-5080 mm）之間。
- 如果頁面有裁切框，則以裁切框為基準調整尺寸，因此已裁切的頁面只保留裁切後的區域。
