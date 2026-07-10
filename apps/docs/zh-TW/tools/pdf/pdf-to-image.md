---
description: "將 PDF 頁面轉換為高品質影像。"
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: c32e4df74c3a
---

# PDF 轉影像 {#pdf-to-image}

將 PDF 頁面轉換為高品質的點陣影像。支援頁面選擇、多種輸出格式、DPI 控制與色彩模式。包含 info 與 preview 子路由，可在轉換前檢視 PDF。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| format | string | 否 | `"png"` | 輸出格式：`png`、`jpg`、`webp`、`avif`、`tiff`、`gif`、`heic`、`heif`、`jxl` |
| dpi | number | 否 | 150 | 渲染解析度（36 至 2400）。DPI 越高產生的影像越大、越精細。 |
| quality | number | 否 | 85 | 有損格式的輸出品質（1 至 100） |
| colorMode | string | 否 | `"color"` | 色彩模式：`color`、`grayscale`、`bw`（黑白閾值） |
| pages | string | 否 | `"all"` | 頁面選擇：`all`、單頁（`3`）、範圍（`1-5`）或以逗號分隔（`1,3,5-8`） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info 子路由 {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

回傳 PDF 的頁數，而不渲染任何頁面。

### Info 請求 {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info 回應 {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview 子路由 {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

以 base64 資料 URL 的形式回傳所有頁面的低解析度 JPEG 縮圖。適用於建立頁面選擇 UI。

### Preview 請求 {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview 回應 {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## 注意事項 {#notes}

- 使用 MuPDF 進行 PDF 渲染，提供高保真的輸出，具備正確的字型渲染與向量圖形。
- 不支援受密碼保護的 PDF，會回傳 400 錯誤。
- `pages` 參數支援靈活的語法：
  - `"all"` 或 `""` - 所有頁面
  - `"3"` - 單頁
  - `"1-5"` - 頁面範圍（含端點）
  - `"1,3,5-8"` - 混合個別頁面與範圍
- 頁碼以 1 為起始。指定超過文件長度的頁面會回傳 400 錯誤。
- 主端點一律會同時產生個別頁面下載檔以及包含所有選定頁面的 ZIP。
- Preview 端點以 72 DPI 渲染並縮放至 300px 寬，以快速產生縮圖。縮圖為 60% 品質的 JPEG。
- Preview 端點會遵循 `MAX_PDF_PAGES` 伺服器設定，限制產生的縮圖數量。
- 對於高 DPI 的大型文件，處理時間會成比例增加。網頁使用建議採用較低的 DPI（150），列印則採用較高的 DPI（300-600）。
