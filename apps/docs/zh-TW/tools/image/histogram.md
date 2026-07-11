---
description: "從圖片產生 RGB 色階分布圖表，並附上各通道統計資料。"
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 3dd56418badb
---

# 色階分布圖 {#histogram}

從圖片產生 RGB 色階分布圖表。回應 JSON 中會傳回一張 PNG 色階分布圖，以及各通道統計資料與 256 格的原始色階分布資料。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/histogram`

接受包含一個圖片檔案的 multipart 表單資料，以及一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| scale | string | 否 | `"linear"` | Y 軸刻度：`linear` 或 `log` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## 注意事項 {#notes}

- `downloadUrl` 指向一張算繪好的 PNG 色階分布圖，顯示 R、G、B 與亮度的分布。
- `bins` 包含每個通道（紅、綠、藍、亮度）的 256 個原始數值陣列，適合用於算繪自訂視覺化。
- `stats` 提供每個通道的平均值、中位數與標準差。
- `mean` 與 `max` 是為了向後相容的簡寫欄位。
- 當色階分布被少數幾個尖峰主導、而你想看清較低格中的細節時，請使用 `log` 刻度。
- HEIC、RAW、PSD 與 SVG 輸入會在分析前自動解碼。
