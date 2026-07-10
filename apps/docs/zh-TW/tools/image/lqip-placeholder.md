---
description: "產生附帶 base64 data URI 的微型低品質圖片佔位符。"
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 5f98d1786a40
---

# LQIP 佔位符 {#lqip-placeholder}

從來源圖片產生微型低品質圖片佔位符（LQIP）。回傳一個小型佔位符檔案，並附上 base64 data URI、可直接使用的 HTML `<img>` 標籤，以及可立即嵌入的 CSS `background-image` 片段。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

接受包含一個圖片檔案的 multipart 表單資料，以及一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | `16` | 目標寬度（像素，4-64） |
| blur | number | 否 | `2` | 模糊策略的模糊半徑（0-20） |
| strategy | string | 否 | `"blur"` | 佔位符策略：`blur`、`pixelate` 或 `solid` |
| format | string | 否 | `"webp"` | 輸出格式：`webp`、`png` 或 `jpeg` |
| quality | integer | 否 | `50` | 輸出品質（1-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## 注意事項 {#notes}

- `dataUri` 欄位包含完整的 data URI，可直接用於 `src` 屬性或 CSS，無需額外請求。
- `html` 與 `css` 欄位提供常見使用情境的複製貼上片段。
- `blur` 策略產生柔和、模糊的縮圖。`pixelate` 策略建立塊狀馬賽克。`solid` 策略回傳單一平均色。
- 典型的佔位符大小為 200-500 位元組，適合直接內嵌於 HTML 中。
- 高度會自動計算，以保留來源圖片的長寬比。
- HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
