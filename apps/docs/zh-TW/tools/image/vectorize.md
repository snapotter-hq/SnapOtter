---
description: "使用黑白（potrace）與全彩多圖層向量化將點陣影像轉換為 SVG。"
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 9590e97901c4
---

# 影像轉 SVG {#image-to-svg}

使用描摹演算法將點陣影像向量化為 SVG。支援黑白描摹（potrace）與全彩多圖層向量化。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| colorMode | string | 否 | `"bw"` | 描摹模式：`bw`（黑白）或 `color`（多色圖層） |
| threshold | number | 否 | 128 | 黑白模式的亮度閾值（0 至 255）。低於此值的像素會變成黑色。 |
| colorPrecision | number | 否 | 6 | 彩色模式的色彩量化精度（1 至 16）。值越高產生越多不同的色彩圖層。 |
| layerDifference | number | 否 | 6 | 彩色模式中圖層之間的最小色彩差異（1 至 128） |
| filterSpeckle | number | 否 | 4 | 描摹形狀的最小面積（像素）（1 至 256）。移除雜訊/斑點。 |
| pathMode | string | 否 | `"spline"` | 路徑平滑：`none`（鋸齒）、`polygon`（直線段）、`spline`（平滑曲線） |
| cornerThreshold | number | 否 | 60 | 彩色模式中角落偵測的角度閾值（0 至 180 度） |
| invert | boolean | 否 | `false` | 在描摹前反轉影像（黑白互換） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### 彩色向量化 {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## 注意事項 {#notes}

- 無論輸入格式為何，輸出一律為 SVG 檔案。
- 支援 HEIC、RAW、PSD 與 SVG 輸入格式（在描摹前自動解碼為點陣圖）。
- 黑白模式使用 potrace 演算法。影像會先轉換為灰階，再以閾值化為純黑白後進行描摹。
- 彩色模式採用多圖層做法：影像被量化為色彩圖層，每一層分別描摹並在 SVG 輸出中堆疊。
- 較低的 `filterSpeckle` 值會保留更多細節，但會產生路徑更多、體積更大的 SVG 檔案。
- `pathMode` 設定對檔案大小影響顯著：`none` 產生最多路徑，`spline` 產生最平滑（通常也最小）的輸出。
- 若要處理標誌與圖示以獲得最佳效果，請使用黑白模式並搭配乾淨的高對比輸入。若處理照片或插圖，請使用彩色模式並搭配較高的 `colorPrecision`。
