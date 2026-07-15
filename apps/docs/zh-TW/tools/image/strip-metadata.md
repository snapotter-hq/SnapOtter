---
description: "從影像移除 EXIF、GPS、ICC 與 XMP 中繼資料，以保護隱私並縮小檔案大小。"
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 11185204026f
---

# 移除影像中繼資料 {#remove-metadata}

從影像移除 EXIF、GPS、ICC 色彩描述檔與 XMP 中繼資料。適用於保護隱私（移除 GPS 座標、相機資訊）以及縮小檔案大小。

## API 端點 {#api-endpoints}

### 移除中繼資料 {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

處理影像並回傳已移除所選中繼資料的乾淨版本。

### 檢視中繼資料 {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

以 JSON 回傳解析後的中繼資料，不會修改影像。適用於在移除之前預覽存在哪些中繼資料。

## 參數（移除） {#parameters-strip}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | 否 | `false` | 移除 EXIF 資料（相機設定、日期等） |
| stripGps | boolean | 否 | `false` | 只移除 GPS/位置資料 |
| stripIcc | boolean | 否 | `false` | 移除 ICC 色彩描述檔 |
| stripXmp | boolean | 否 | `false` | 移除 XMP 中繼資料（Adobe、IPTC） |
| stripAll | boolean | 否 | `true` | 一次移除所有中繼資料 |

當 `stripAll` 為 `true` 時，會覆寫個別旗標並移除全部內容。

## 範例請求 {#example-request}

移除所有中繼資料：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

只移除 GPS 資料（保留相機資訊與色彩描述檔）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

檢視中繼資料而不修改：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 範例回應（移除） {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## 範例回應（檢視） {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## 注意事項 {#notes}

- 移除後影像會以其原始格式重新編碼。JPEG 使用 mozjpeg 以品質 90 編碼，PNG 使用壓縮等級 9，WebP 使用品質 85。
- 若影像原本標記為非 sRGB 描述檔，移除 ICC 描述檔可能造成細微的色彩偏移。若在意色彩準確度，請使用 `stripIcc: false`。
- 檢視端點會將 GPS 座標解析為十進位的緯度/經度值（以底線為前綴），以便使用。
- 支援的輸入格式：JPEG、PNG、WebP、AVIF、TIFF、GIF。
