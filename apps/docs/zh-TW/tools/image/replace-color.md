---
description: "將圖片中的特定顏色替換為另一種顏色或使其變透明。"
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 4cad1f4ab6d7
---

# 替換與反轉顏色 {#replace-invert-color}

將符合來源顏色的像素替換為目標顏色，或使其變透明。在 RGB 空間中使用歐氏距離，並可設定容差，於顏色邊界處達成平滑混合。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

接受 multipart 表單資料，包含一個圖片檔案與一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| sourceColor | string | 否 | `"#FF0000"` | 要尋找的十六進位顏色（格式：`#RRGGBB`） |
| targetColor | string | 否 | `"#00FF00"` | 要替換成的十六進位顏色（格式：`#RRGGBB`） |
| makeTransparent | boolean | 否 | `false` | 使符合的像素變透明，而非替換為目標顏色 |
| tolerance | number | 否 | `30` | 顏色比對容差（0 至 255）。數值越高，比對到的相似顏色範圍越廣 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

使綠色背景變透明：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## 注意事項 {#notes}

- 顏色比對在 RGB 空間中使用歐氏距離，並以 `tolerance * sqrt(3)` 縮放。
- 替換混合與顏色距離成正比：越接近來源顏色的像素會接收越多目標顏色，形成平滑過渡。
- 當 `makeTransparent` 為 `true` 時，若輸入格式不支援 alpha 通道（例如 JPEG），輸出會強制為 PNG（或 WebP/AVIF）。
- 容差為 0 時只會比對完全相同的來源顏色。較高的數值（50+）會比對更廣範圍的相似色調。
- 除非需要透明度且輸入格式缺乏 alpha 支援，否則輸出格式會與輸入格式相符。
