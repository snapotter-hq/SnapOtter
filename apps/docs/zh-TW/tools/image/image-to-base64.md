---
description: "將圖片轉換為 base64 data URI，以嵌入 HTML、CSS 等。"
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 2508d04542b2
---

# 圖片轉 Base64 {#image-to-base64}

將一張或多張圖片轉換為 base64 編碼字串與 data URI。支援選填的格式轉換、品質控制與縮放。適合將圖片直接嵌入 HTML、CSS、JSON 或電子郵件範本。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

接受包含一個或多個圖片檔案的 multipart 表單資料，以及一個選填的 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| outputFormat | string | 否 | `"original"` | 編碼前先轉換：`original`、`jpeg`、`png`、`webp`、`avif`、`jxl` |
| quality | number | 否 | `80` | 有損格式的輸出品質（1 到 100） |
| maxWidth | number | 否 | `0` | 最大寬度（像素，0 = 不縮放，不會放大） |
| maxHeight | number | 否 | `0` | 最大高度（像素，0 = 不縮放，不會放大） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

多個檔案：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## 範例回應 {#example-response}

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

## 回應欄位 {#response-fields}

| 欄位 | 型別 | 說明 |
|-------|------|-------------|
| results | array | 成功轉換的圖片 |
| errors | array | 處理失敗的圖片（含檔名與錯誤訊息） |

### Result 物件 {#result-object}

| 欄位 | 型別 | 說明 |
|-------|------|-------------|
| filename | string | 原始檔名 |
| mimeType | string | 編碼輸出的 MIME 類型 |
| width | number | 最終寬度（像素，經任何縮放後） |
| height | number | 最終高度（像素，經任何縮放後） |
| originalSize | number | 原始檔案大小（位元組） |
| encodedSize | number | base64 字串的大小（位元組） |
| overheadPercent | number | 與原始檔案相比的大小差異百分比（正值 = 較大，負值 = 較小） |
| base64 | string | 原始的 base64 編碼圖片資料 |
| dataUri | string | 可直接用於 `src` 屬性的完整 data URI |

## 注意事項 {#notes}

- Base64 編碼通常會使大小比二進位檔案增加約 33%。`overheadPercent` 欄位會顯示實際差異。
- 當 `outputFormat` 為 `"original"` 時，HEIC/HEIF 檔案會轉換為 JPEG（因為瀏覽器無法在 data URI 中顯示 HEIC）。
- `maxWidth` 與 `maxHeight` 選項會使用 `fit: inside` 搭配 `withoutEnlargement` 進行縮放，因此小於指定尺寸的圖片不會被放大。
- 單一請求可處理多個檔案。每個檔案都會被獨立處理，某個失敗不會影響其他檔案成功。
- SVG 檔案會以 `image/svg+xml` 直接傳遞而不重新編碼（除非要求進行格式轉換）。
- 這是唯讀端點。它不會產生可下載的檔案或 `jobId`。base64 資料會直接在回應主體中傳回。
