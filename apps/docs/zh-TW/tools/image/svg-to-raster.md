---
description: "以自訂解析度與 DPI 將 SVG 檔案轉換為 PNG、JPEG、WebP、AVIF、TIFF、GIF、HEIF 或 JXL，並支援批次處理。"
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 33f4e9c366d1
---

# SVG 轉點陣圖 {#svg-to-raster}

以自訂解析度與 DPI 將 SVG 檔案轉換為點陣影像格式（PNG、JPEG、WebP、AVIF、TIFF、GIF、HEIF 或 JXL）。亦支援多個 SVG 的批次轉換。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | - | 目標寬度（像素）（1 至 65536）。若只設定一個維度，則維持長寬比。 |
| height | integer | 否 | - | 目標高度（像素）（1 至 65536）。若只設定一個維度，則維持長寬比。 |
| dpi | integer | 否 | 300 | 算繪 DPI，控制基礎點陣化密度（36 至 2400） |
| quality | number | 否 | 90 | 有損格式的輸出品質（1 至 100） |
| backgroundColor | string | 否 | `"#00000000"` | 背景顏色，以十六進位表示（6 或 8 個字元，8 字元含 alpha） |
| outputFormat | string | 否 | `"png"` | 輸出格式：`png`、`jpg`、`webp`、`avif`、`tiff`、`gif`、`heif`、`jxl` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## 批次端點 {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

在單一請求中轉換多個 SVG 檔案。回傳 ZIP 壓縮檔。

### 額外的批次參數 {#additional-batch-parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| clientJobId | string | 否 | - | 用於進度追蹤的選用客戶端工作 ID（最多 128 個字元） |

### 批次範例請求 {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### 批次回應 {#batch-response}

批次端點會直接串流 ZIP 檔案，並帶有以下標頭：
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## 注意事項 {#notes}

- 只接受 SVG 與 SVGZ 檔案（驗證內容，而不只是副檔名）。SVGZ 會自動解壓縮。
- SVG 內容在算繪前會經過清理，以防止 XSS 與外部資源載入。
- `dpi` 設定控制 SVG 點陣化的密度。較高的 DPI 會從相同的 SVG 視域產生較大的像素尺寸。
- 當同時提供 `width` 與 `height` 時，影像會使用 `fit: inside` 調整大小（在邊界範圍內維持長寬比）。
- 對於瀏覽器無法原生顯示的格式（TIFF、HEIF），回應中會包含 `previewUrl`。預覽為 1200px 的 WebP 縮圖。
- 預設背景 `#00000000` 為完全透明。若要白色背景（適用於不支援透明度的 JPEG 輸出），請設為 `#FFFFFF`。
- 批次處理會遵循 `MAX_BATCH_SIZE` 伺服器設定，並使用並行工作者以提升效能。
- 批次作業的進度可透過位於 `/api/v1/jobs/:jobId/progress` 的 SSE 追蹤。
