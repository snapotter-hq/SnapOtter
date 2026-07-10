---
description: "以 AI 修圖（LaMa）從圖片中移除不需要的物件，並由標示欲擦除區域的遮罩引導。"
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 20970b625321
---

# 物件擦除 {#object-eraser}

使用 AI 修圖（LaMa 模型）從圖片中移除不需要的物件。需提供一張圖片與一張標示欲擦除區域的遮罩。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 取得狀態）

**模型套件：** `object-eraser-colorize`（1-2 GB）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 來源圖片檔案（multipart） |
| mask | file | 是 | - | 遮罩圖片（白色 = 欲擦除區域，黑色 = 保留）。必須以欄位名稱 `mask` 上傳 |
| format | string | 否 | `"auto"` | 輸出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | integer | 否 | `95` | 輸出品質（1-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
```

## 回應 {#response}

### 初始回應（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進度（SSE，位於 `/api/v1/jobs/{jobId}/progress`） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## 備註 {#notes}

- 需要安裝 `object-eraser-colorize` 模型套件（1-2 GB）。
- 遮罩必須與來源圖片尺寸相同。白色像素表示欲擦除的區域；AI 會以合理的內容填補這些區域。
- 使用 LaMa（Large Mask Inpainting）進行高品質的物件移除。
- 對於瀏覽器無法預覽的輸出格式，會在主要輸出旁一併產生 WebP 預覽。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
