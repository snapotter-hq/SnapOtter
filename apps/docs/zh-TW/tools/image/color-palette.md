---
description: "從圖片中擷取主要色彩，形成調色盤。"
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 267412ebdd76
---

# 調色盤 {#color-palette}

從圖片中擷取主要色彩，並以十六進位色值回傳。使用量化頻率分析找出最突出且在視覺上最具辨識度的色彩。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

接受包含圖片檔案與選填 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| count | integer | 否 | `8` | 要擷取的色彩數量（2-16） |
| format | string | 否 | `"hex"` | 色彩格式：`hex`、`rgb`、`hsl` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## 範例回應 {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## 回應欄位 {#response-fields}

| 欄位 | 類型 | 說明 |
|-------|------|-------------|
| filename | string | 已清理的檔名 |
| colors | array | 以請求格式表示的色彩字串陣列，依主導程度排序（最常出現的在前） |
| hex | array | 十六進位色彩字串陣列（無論 `format` 設定為何，一律為十六進位） |
| count | number | 擷取的色彩數量 |

## 備註 {#notes}

- 最多回傳 `count` 個主要色彩（預設 8，範圍 2-16），依頻率排序（最常見的在前）。
- 圖片在分析時會被內部縮放為 100x100 像素，因此調色盤代表的是整體色彩分佈，而非細微細節。
- 色彩使用中位切割量化（median-cut quantization）擷取，該方法會沿著範圍最寬的通道遞迴分割像素群。
- 分析前會移除 alpha 通道，因此透明區域不會被納入考量。
- 這是唯讀端點。它不會產生可下載的輸出檔案或 `jobId`。
- HEIC、RAW、PSD 與 SVG 輸入會在分析前自動解碼。
