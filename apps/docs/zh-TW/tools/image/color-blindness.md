---
description: "模擬圖片在不同類型色覺缺陷者眼中的呈現方式。"
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 83afdc1d121e
---

# 色盲模擬 {#color-blindness-simulation}

模擬色覺缺陷（CVD），預覽圖片在各種色盲類型者眼中的呈現方式。適用於設計、圖表與 UI 的無障礙測試。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

接受包含圖片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| simulationType | string | 否 | `"deuteranomaly"` | 要模擬的色覺缺陷類型 |

### 模擬類型 {#simulation-types}

| 值 | 狀況 | 說明 |
|-------|-----------|-------------|
| `protanopia` | 紅色盲 | 完全缺乏紅色錐狀細胞 |
| `deuteranopia` | 綠色盲 | 完全缺乏綠色錐狀細胞 |
| `tritanopia` | 藍色盲 | 完全缺乏藍色錐狀細胞 |
| `protanomaly` | 紅色弱 | 紅色錐狀細胞敏感度降低 |
| `deuteranomaly` | 綠色弱 | 綠色錐狀細胞敏感度降低（最常見） |
| `tritanomaly` | 藍色弱 | 藍色錐狀細胞敏感度降低 |
| `achromatopsia` | 全色盲 | 完全缺乏色覺 |
| `blueConeMonochromacy` | 僅藍錐 | 只有藍色錐狀細胞可運作 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## 備註 {#notes}

- 綠色弱（deuteranomaly）為預設值，因為它是最常見的色覺缺陷形式，約影響 6% 的男性。
- 模擬使用色彩轉換矩陣，模擬錐狀感光細胞減少或缺失如何改變感知到的色彩。
- 此工具為非破壞性，僅產生預覽。它不會為了無障礙目的而修改原始圖片。
- 輸出格式與輸入格式相符。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
