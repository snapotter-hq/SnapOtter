---
description: "透過格式轉換、品質控制、調整大小與中繼資料移除來最佳化圖片以供網頁傳遞。"
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 7bc17dc21e32
---

# 最佳化以供網頁使用 {#optimize-for-web}

單一步驟即可最佳化圖片以供網頁傳遞。結合格式轉換、品質調整、選用的調整大小、漸進式編碼與中繼資料移除。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

接受 multipart 表單資料，包含一個圖片檔案與一個 JSON `settings` 欄位。

另外還提供一個即時預覽端點於 `POST /api/v1/tools/image/optimize-for-web/preview`，會直接以二進位形式傳回處理後的圖片（不建立工作區），供即時調整參數使用。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| format | string | 否 | `"webp"` | 輸出格式：`webp`、`jpeg`、`avif`、`png`、`jxl` |
| quality | number | 否 | `80` | 輸出品質（1-100） |
| maxWidth | number | 否 | - | 最大寬度（像素）。若圖片較寬則會縮小。 |
| maxHeight | number | 否 | - | 最大高度（像素）。若圖片較高則會縮小。 |
| progressive | boolean | 否 | `true` | 啟用漸進式／交錯式編碼 |
| stripMetadata | boolean | 否 | `true` | 移除 EXIF、GPS、ICC 與 XMP 中繼資料 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

以積極壓縮方式最佳化為 AVIF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### 預覽端點回應 {#preview-endpoint-response}

預覽端點（`/api/v1/tools/image/optimize-for-web/preview`）會直接傳回二進位圖片，並附帶資訊性標頭：

- `X-Original-Size` - 原始檔案大小（位元組）
- `X-Processed-Size` - 處理後檔案大小（位元組）
- `X-Output-Filename` - URL 編碼的輸出檔名

## 注意事項 {#notes}

- 此工具設計為網頁資源的一站式最佳化流程。它會在單次處理中完成格式轉換、品質調整、最大尺寸上限與中繼資料移除。
- 輸出檔名的副檔名會更新以符合所選格式。
- JXL（JPEG XL）編碼使用專用的 CLI 編碼器。圖片會先處理為 PNG，再編碼為 JXL。
- 漸進式編碼可讓瀏覽器在完整圖片載入前先呈現低品質預覽，藉此改善 JPEG 與 PNG 的感知載入時間。
- 預覽端點較為輕量（不建立工作區／作業），用於前端的即時參數調整 UI。
