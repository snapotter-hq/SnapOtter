---
description: "將一張或多張圖片合併為 PDF 文件，並提供頁面尺寸、方向與目標檔案大小選項。"
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 0cc07a4a39ea
---

# 圖片轉 PDF {#image-to-pdf}

將一張或多張圖片合併為 PDF 文件。支援多種頁面尺寸、方向、邊界，以及透過品質調整達成的選填檔案大小目標。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

接受包含一個或多個圖片檔案的 multipart 表單資料，以及一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| pageSize | string | 否 | `"A4"` | 頁面尺寸：`A4`、`Letter`、`A3`、`A5` |
| orientation | string | 否 | `"portrait"` | 頁面方向：`portrait` 或 `landscape` |
| margin | number | 否 | `20` | 頁面邊界（點，0-500） |
| targetSize | object | 否 | - | 目標檔案大小限制（見下方） |
| collate | boolean | 否 | `true` | 將所有圖片合併為一份 PDF。若為 `false`，則每張圖片產生一份 PDF。 |

### Target Size 物件 {#target-size-object}

| 欄位 | 型別 | 必填 | 說明 |
|-------|------|----------|-------------|
| value | number | 是 | 目標大小數值 |
| unit | string | 是 | 單位：`KB` 或 `MB` |

最小目標大小為 50 KB。

## 範例請求 {#example-request}

基本多圖 PDF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

含檔案大小目標：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

每張圖片一份 PDF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## 範例回應（合併） {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## 範例回應（未合併） {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## 範例回應（含目標大小） {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## 注意事項 {#notes}

- 圖片會置中於頁面，並在保留長寬比的前提下縮放以套入邊界內。圖片絕不會被放大。
- 當 `collate` 為 `false` 時，每張圖片會成為獨立的 PDF 檔案，下載為包含所有 PDF 的 ZIP 封存檔。
- 目標大小功能會對 JPEG 品質等級（10-95）進行迭代二分搜尋，找出在預算內符合的最佳品質。
- 透明圖片在嵌入 PDF 前會平整化為白色。
- 支援的輸入格式：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、RAW、PSD、SVG 等。
- 嵌入前會自動套用 EXIF 方向資訊。
