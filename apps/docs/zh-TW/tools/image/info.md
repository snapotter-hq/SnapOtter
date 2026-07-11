---
description: "檢視詳細的圖片中繼資料、屬性與各通道色階分布統計。"
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 066471fc2286
---

# 圖片資訊 {#image-info}

唯讀分析工具，傳回完整的圖片中繼資料，包含尺寸、格式、色彩空間、EXIF/ICC/XMP 是否存在，以及各通道色階分布統計。不會產生已處理的輸出檔案。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/info`

接受包含一個圖片檔案的 multipart 表單資料。不需要 settings 欄位。

## 參數 {#parameters}

此工具沒有可設定的參數。只需上傳圖片檔案即可。

| 欄位 | 型別 | 必填 | 說明 |
|-------|------|----------|-------------|
| file | file | 是 | 要分析的圖片 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 範例回應 {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## 回應欄位 {#response-fields}

| 欄位 | 型別 | 說明 |
|-------|------|-------------|
| filename | string | 已清理的檔名 |
| fileSize | number | 檔案大小（位元組） |
| width | number | 圖片寬度（像素） |
| height | number | 圖片高度（像素） |
| format | string | 偵測到的格式（jpeg、png、webp 等） |
| channels | number | 色彩通道數 |
| hasAlpha | boolean | 圖片是否具有 alpha 通道 |
| colorSpace | string | 色彩空間（srgb、cmyk 等） |
| density | number 或 null | DPI/PPI 解析度 |
| isProgressive | boolean | JPEG 是否使用漸進式編碼 |
| orientation | number 或 null | EXIF 方向值（1-8） |
| hasProfile | boolean | 是否嵌入了 ICC 描述檔 |
| hasExif | boolean | 是否存在 EXIF 中繼資料 |
| hasIcc | boolean | 是否存在 ICC 色彩描述檔 |
| hasXmp | boolean | 是否存在 XMP 中繼資料 |
| bitDepth | string 或 null | 每個取樣的位元數 |
| pages | number | 頁數（適用於 TIFF、GIF 等多頁格式） |
| histogram | array | 各通道統計（最小值、最大值、平均值、標準差） |

## 注意事項 {#notes}

- 這是唯讀端點。它不會產生可下載的輸出檔案或 `jobId`。
- 對於 RAW 格式圖片（DNG、CR2、NEF、ARW 等），會使用 ExifTool 擷取 Sharp 無法直接讀取的真實感光元件尺寸與中繼資料旗標。
- HEIC/HEIF 檔案會在內部解碼為 PNG 以擷取像素統計，因為 Sharp 無法解碼 HEVC 像素。
- 色階分布提供各通道的最小值/最大值/平均值/標準差，而非完整的 256 格分布。
- `density` 欄位反映嵌入的 DPI 中繼資料（若存在）。
