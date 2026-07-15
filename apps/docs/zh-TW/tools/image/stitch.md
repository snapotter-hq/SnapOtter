---
description: "將影像並排、堆疊或以網格方式接合，並可控制對齊、間隙、邊框與縮放模式。"
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 450bbb6647a7
---

# 拼接影像 {#stitch-combine}

將多張影像並排接合、垂直堆疊或以網格排列。支援對齊、間隙、邊框、圓角半徑以及多種縮放模式。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| direction | string | 否 | `"horizontal"` | 版面方向：`horizontal`、`vertical`、`grid` |
| gridColumns | integer | 否 | 2 | 當方向為 `grid` 時的欄數（2 至 100） |
| resizeMode | string | 否 | `"fit"` | 影像的縮放方式：`fit`、`original`、`stretch`、`crop` |
| alignment | string | 否 | `"center"` | 交叉軸對齊：`start`、`center`、`end` |
| gap | number | 否 | 0 | 影像之間的間隙（像素）（0 至 1000） |
| border | number | 否 | 0 | 外邊框寬度（像素）（0 至 500） |
| cornerRadius | number | 否 | 0 | 套用於最終輸出的圓角半徑（0 至 500） |
| backgroundColor | string | 否 | `"#FFFFFF"` | 背景/邊框顏色，以十六進位表示（例如 `#FF0000`） |
| format | string | 否 | `"png"` | 輸出格式：`png`、`jpeg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | 90 | 輸出品質（1 至 100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## 注意事項 {#notes}

- 至少需要 2 張影像。在 multipart 請求中上傳多個影像檔案。
- 支援 HEIC、RAW、PSD 與 SVG 輸入格式（自動解碼）。
- 縮放模式：
  - `fit` - 沿接合軸縮放影像以配合最小尺寸。
  - `original` - 保留原始尺寸（可能產生不平整的邊緣）。
  - `stretch` - 強制影像配合最小尺寸，不保留長寬比。
  - `crop` - 以覆蓋方式裁切影像以配合最小尺寸。
- 在 `grid` 模式下，儲存格大小會設為所有影像尺寸的中位數。
- `cornerRadius` 會套用於整個最終輸出，而非個別影像。
- 畫布大小受 `MAX_CANVAS_PIXELS` 伺服器設定限制，以防止記憶體耗盡。
