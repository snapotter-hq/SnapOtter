---
description: "使用 25+ 種範本、可調整的間距與圓角，以及每格的平移與縮放，將多張圖片組合成網格拼貼。"
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: 562975f3d64d
---

# 拼貼 / 網格 {#collage-grid}

使用 25+ 種範本將多張圖片組合成精美的網格拼貼。支援 2-9 張圖片的版面配置，並可自訂間距、圓角半徑、背景顏色，以及每格的平移／縮放控制。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/collage`

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| templateId | string | 是 | - | 範本版面配置 ID（例如 `2-h-equal`、`3-left-large`、`4-grid`、`9-grid`） |
| cells | array | 否 | - | 每格設定的陣列，含 `imageIndex`、`panX`、`panY`、`zoom`、`objectFit` |
| cells[].imageIndex | integer | 是 | - | 要放入此格的圖片索引（從 0 開始） |
| cells[].panX | number | 否 | 0 | 水平平移偏移量（-100 至 100） |
| cells[].panY | number | 否 | 0 | 垂直平移偏移量（-100 至 100） |
| cells[].zoom | number | 否 | 1 | 縮放層級（1 至 10） |
| cells[].objectFit | string | 否 | `"cover"` | 圖片如何填滿格子：`cover` 或 `contain` |
| gap | number | 否 | 8 | 格子之間的間距（像素，0 至 500） |
| cornerRadius | number | 否 | 0 | 每格的圓角半徑（像素，0 至 500） |
| backgroundColor | string | 否 | `"#FFFFFF"` | 背景顏色，以十六進位表示或 `"transparent"` |
| aspectRatio | string | 否 | `"free"` | 畫布長寬比：`free`、`1:1`、`4:3`、`3:2`、`16:9`、`9:16`、`4:5` |
| outputFormat | string | 否 | `"png"` | 輸出格式：`png`、`jpeg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | 90 | 輸出品質（1 至 100） |

## 可用範本 {#available-templates}

| 範本 ID | 圖片數 | 版面配置 |
|-------------|--------|--------|
| `2-h-equal` | 2 | 兩個相等的欄 |
| `2-v-equal` | 2 | 兩個相等的列 |
| `2-h-left-large` | 2 | 左 2/3，右 1/3 |
| `2-h-right-large` | 2 | 左 1/3，右 2/3 |
| `3-left-large` | 3 | 左邊大圖，右邊兩張堆疊 |
| `3-right-large` | 3 | 左邊兩張堆疊，右邊大圖 |
| `3-top-large` | 3 | 上方大圖，下方兩欄 |
| `3-h-equal` | 3 | 三個相等的欄 |
| `3-v-equal` | 3 | 三個相等的列 |
| `4-grid` | 4 | 2x2 網格 |
| `4-left-large` | 4 | 左邊大圖，右邊三張堆疊 |
| `4-top-large` | 4 | 上方大圖，下方三欄 |
| `4-bottom-large` | 4 | 上方三欄，下方大圖 |
| `5-top2-bottom3` | 5 | 上方兩張，下方三張 |
| `5-top3-bottom2` | 5 | 上方三張，下方兩張 |
| `5-left-large` | 5 | 左邊大圖，右邊四張堆疊 |
| `5-center-large` | 5 | 中央大圖，四角圍繞 |
| `6-grid-2x3` | 6 | 2 欄 x 3 列 |
| `6-grid-3x2` | 6 | 3 欄 x 2 列 |
| `6-top-large` | 6 | 上方大圖，下方五欄 |
| `7-mosaic` | 7 | 馬賽克版面配置 |
| `8-mosaic` | 8 | 馬賽克版面配置 |
| `9-grid` | 9 | 3x3 網格 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## 備註 {#notes}

- 在 multipart 請求中上傳多個圖片檔案。圖片會依上傳順序指派到範本格子。
- 若上傳的圖片數量超過範本所支援的數量，多餘的圖片會被忽略。
- 支援 HEIC、RAW、PSD 與 SVG 輸入格式（自動解碼）。
- 畫布基準尺寸為最長邊 2400px，並依所選長寬比縮放。
- 當 `aspectRatio` 為 `"free"` 時，畫布預設為 4:3（2400x1800）。
- 每格的 `panX`/`panY` 值會在格子內平移裁切視窗。值為 100 表示完全移到一側邊緣，-100 則移到另一側。
- `"transparent"` 背景顏色僅在 `png`、`webp` 或 `avif` 輸出格式下才會保留。
