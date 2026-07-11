---
description: "以位置、不透明度與混合模式將圖片分層疊合。"
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: aca6b488454c
---

# 圖片合成 {#image-composition}

將疊加圖片疊在底圖之上，並可設定位置、不透明度與混合模式。適用於合成標誌、圖形，或組合多張圖片。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/compose`

接受包含**兩個**圖片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| x | number | 否 | `0` | 疊加圖片相對於左上角的水平偏移（像素，最小 0） |
| y | number | 否 | `0` | 疊加圖片相對於左上角的垂直偏移（像素，最小 0） |
| opacity | number | 否 | `100` | 疊加圖片的不透明度百分比（0 至 100） |
| blendMode | string | 否 | `"over"` | 合成混合模式 |

### 混合模式 {#blend-modes}

| 值 | 說明 |
|-------|-------------|
| `over` | 一般疊加（預設） |
| `multiply` | 以相乘像素值加深 |
| `screen` | 以反轉、相乘、再反轉的方式提亮 |
| `overlay` | 依底圖亮度結合相乘與濾色 |
| `darken` | 保留每層中較暗的像素 |
| `lighten` | 保留每層中較亮的像素 |
| `hard-light` | 強烈對比疊加 |
| `soft-light` | 柔和對比疊加 |
| `difference` | 兩層之間的絕對差異 |
| `exclusion` | 類似差異但對比較低 |

### 檔案欄位 {#file-fields}

| 欄位名稱 | 必填 | 說明 |
|------------|----------|-------------|
| file | 是 | 底圖／背景圖片 |
| overlay | 是 | 疊加／前景圖片 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

使用相乘（multiply）混合模式：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## 備註 {#notes}

- 兩張圖片在合成前都會經過驗證與解碼（支援 HEIC、RAW、PSD、SVG）。
- 疊加圖片會放置在 `x` 與 `y` 指定的精確像素座標。它不會被縮放以配合底圖。
- 若不透明度小於 100，混合前會在疊加圖片上套用 alpha 遮罩。
- 疊加圖片可以延伸超出底圖邊界（超出部分會被裁去）。
- 處理前會在兩張圖片上自動套用 EXIF 方向。
- 輸出尺寸與底圖尺寸相符。
