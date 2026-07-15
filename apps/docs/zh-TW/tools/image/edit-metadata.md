---
description: "編輯圖片中的 EXIF、IPTC、GPS 與 XMP 中繼資料欄位，無需重新編碼像素。"
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: bac2c78cbec4
---

# 編輯影像中繼資料 {#edit-metadata}

編輯圖片中繼資料欄位，包含 EXIF、IPTC、GPS 座標、日期與關鍵字。底層使用 ExifTool，因此中繼資料會就地寫入而不重新編碼像素，完整保留圖片品質。

## API 端點 {#api-endpoints}

### 編輯中繼資料 {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

將中繼資料欄位寫入圖片並回傳修改後的檔案。

### 檢視中繼資料 {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

透過 ExifTool 以 JSON 回傳圖片的完整中繼資料。不會修改圖片。

## 參數（編輯） {#parameters-edit}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| title | string | 否 | - | 圖片標題（XMP/EXIF） |
| author | string | 否 | - | 作者名稱 |
| artist | string | 否 | - | 藝術家名稱（EXIF Artist 標籤） |
| copyright | string | 否 | - | 版權聲明 |
| imageDescription | string | 否 | - | 圖片描述（EXIF） |
| software | string | 否 | - | 軟體標籤 |
| dateTime | string | 否 | - | EXIF DateTime 值 |
| dateTimeOriginal | string | 否 | - | EXIF DateTimeOriginal 值 |
| setAllDates | string | 否 | - | 一次設定所有日期欄位 |
| dateShift | string | 否 | - | 依偏移量位移所有日期（格式：`+HH:MM` 或 `-HH:MM`） |
| clearGps | boolean | 否 | `false` | 移除所有 GPS 資料 |
| gpsLatitude | number | 否 | - | 設定 GPS 緯度（-90 至 90） |
| gpsLongitude | number | 否 | - | 設定 GPS 經度（-180 至 180） |
| gpsAltitude | number | 否 | - | 設定 GPS 海拔（公尺） |
| keywords | string[] | 否 | - | 要新增或設定的關鍵字／標籤 |
| keywordsMode | string | 否 | `"add"` | 關鍵字的處理方式：`add`（附加）或 `set`（取代） |
| fieldsToRemove | string[] | 否 | `[]` | 要移除的特定中繼資料欄位名稱清單 |
| iptcTitle | string | 否 | - | IPTC Object Name |
| iptcHeadline | string | 否 | - | IPTC Headline |
| iptcCity | string | 否 | - | IPTC City |
| iptcState | string | 否 | - | IPTC Province/State |
| iptcCountry | string | 否 | - | IPTC Country |

## 範例請求 {#example-request}

設定作者與版權：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

設定 GPS 座標：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

移除 GPS 並新增關鍵字：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

檢視中繼資料：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 範例回應（編輯） {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## 備註 {#notes}

- 此工具需要伺服器上安裝 ExifTool。它已包含在 Docker 映像中。
- 中繼資料會就地寫入，因此不會發生像素重新編碼。檔案大小的變動極小（僅為中繼資料的位元組）。
- `dateShift` 參數會依指定偏移量位移所有日期欄位，適用於修正時區錯誤（例如 `+02:00` 或 `-05:30`）。
- 若未請求任何變更（所有參數皆省略或為空），則原檔會原樣回傳。
- 支援的格式：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC/HEIF。
- 對於瀏覽器無法預覽的格式（HEIF、TIFF），回應會包含一個 `previewUrl` 欄位，內含 WebP 預覽。
