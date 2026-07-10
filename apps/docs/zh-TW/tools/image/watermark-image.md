---
description: "將標誌或影像作為浮水印覆蓋，並可設定位置、不透明度與縮放。"
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 43d07c078257
---

# 影像浮水印 {#image-watermark}

將標誌或次要影像作為浮水印覆蓋在基底影像上。浮水印會相對於基底影像寬度縮放，並置於角落或中心。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

接受包含**兩個**影像檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| position | string | 否 | `"bottom-right"` | 浮水印位置：`center`、`top-left`、`top-right`、`bottom-left`、`bottom-right` |
| opacity | number | 否 | `50` | 浮水印不透明度百分比（0 至 100） |
| scale | number | 否 | `25` | 浮水印寬度，以主影像寬度的百分比表示（1 至 100） |

### 檔案欄位 {#file-fields}

| 欄位名稱 | 必填 | 說明 |
|------------|----------|-------------|
| file | 是 | 主要/基底影像 |
| watermark | 是 | 浮水印/標誌影像 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## 注意事項 {#notes}

- 兩張影像都會經過驗證與解碼（支援 HEIC、RAW、PSD、SVG）。
- 浮水印會等比例調整大小，使其寬度等於主影像寬度的 `scale`%。
- 不透明度透過 alpha 遮罩套用，並以 `dest-in` 混合方式合成。
- 角落位置會使用距影像邊緣 20px 的內距。
- 若浮水印影像具有透明度（例如 PNG 標誌），在合成時會保留該透明度。
- 處理前會在兩張影像上自動套用 EXIF 方向。
