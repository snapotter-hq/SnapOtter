---
description: "在各種格式之間轉換圖片，包含 AVIF、JXL 與 HEIC 等現代格式。"
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: ad48ad57d5c1
---

# 轉換影像 {#convert}

在各種格式之間轉換圖片。支援常見的網頁格式，以及 HEIC、JXL、BMP、ICO、JP2、QOI 與 PSD 等專用格式。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/convert`

接受包含圖片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| format | string | 是 | - | 目標格式：`jpg`、`png`、`webp`、`avif`、`tiff`、`gif`、`heic`、`heif`、`jxl`、`bmp`、`ico`、`jp2`、`qoi`、`psd`、`ppm`、`eps`、`tga` |
| quality | number | 否 | - | 輸出品質（1-100）。適用於 jpg、webp、avif、heic 等有損格式。 |

## 支援的輸出格式 {#supported-output-formats}

| 格式 | 類型 | 備註 |
|--------|------|-------|
| jpg | 有損 | JPEG，相容性最佳 |
| png | 無損 | 支援透明度 |
| webp | 兩者皆可 | 現代網頁格式，壓縮效果佳 |
| avif | 有損 | 次世代格式，壓縮效果極佳 |
| tiff | 兩者皆可 | 印刷／出版工作流程 |
| gif | 無損 | 限 256 色 |
| heic / heif | 有損 | Apple 生態系格式 |
| jxl | 兩者皆可 | JPEG XL，次世代格式 |
| bmp | 無損 | 未壓縮點陣圖 |
| ico | 無損 | Windows 圖示格式 |
| jp2 | 有損 | JPEG 2000 |
| qoi | 無損 | Quite OK Image 格式 |
| psd | 分層 | Adobe Photoshop（需要 ImageMagick） |
| ppm | 無損 | Portable Pixmap（PPM/PGM/PBM） |
| eps | 向量 | Encapsulated PostScript |
| tga | 無損 | Targa 圖片格式 |

## 範例請求 {#example-request}

轉換為 WebP：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

轉換為 PNG（無損）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## 備註 {#notes}

- 輸出檔名的副檔名會自動更新以符合目標格式。
- SVG 輸入會在轉換前以 300 DPI 點陣化。
- PSD 轉換需要伺服器上安裝 ImageMagick。
- BMP、EPS、ICO、JP2、JXL、PPM、QOI 與 TGA 使用專用的 CLI 編碼器，並略過 Sharp 處理。
- HEIC/HEIF 編碼使用系統 HEIC 編碼器函式庫。
- 輸入格式範圍廣泛：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、RAW（CR2、NEF、ARW 等）、PSD、SVG、BMP 等。
