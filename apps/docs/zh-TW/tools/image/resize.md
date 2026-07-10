---
description: "依像素、百分比或使用符合模式來調整圖片大小。"
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: 49ee24967697
---

# 調整大小 {#resize}

透過指定確切的像素尺寸、百分比縮放係數，或控制圖片如何適應目標尺寸的符合模式來調整圖片大小。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/resize`

接受 multipart 表單資料，包含一個圖片檔案與一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | - | 目標寬度（像素，最大 16383） |
| height | integer | 否 | - | 目標高度（像素，最大 16383） |
| fit | string | 否 | `"contain"` | 圖片如何符合尺寸：`contain`、`cover`、`fill`、`inside`、`outside` |
| withoutEnlargement | boolean | 否 | `false` | 若圖片小於目標則避免放大 |
| percentage | number | 否 | - | 依百分比縮放（例如 50 表示縮至一半大小） |

必須至少提供 `width`、`height` 或 `percentage` 其中之一。

### 符合模式 {#fit-modes}

- **contain** - 調整大小以符合尺寸範圍內，並保留長寬比（可能留下空白區域）
- **cover** - 調整大小以覆蓋尺寸，並保留長寬比（可能裁切）
- **fill** - 拉伸至完全符合尺寸（忽略長寬比）
- **inside** - 類似 `contain`，但只縮小，絕不放大
- **outside** - 類似 `cover`，但只縮小，絕不放大

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

依百分比調整大小：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## 注意事項 {#notes}

- 任一軸的最大尺寸為 16383 像素（Sharp/libvips 限制）。
- 輸出格式與輸入格式相符。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
- 調整大小前會自動套用 EXIF 方向。
- `withoutEnlargement` 旗標適用於批次處理，其中某些圖片可能已小於目標尺寸。
