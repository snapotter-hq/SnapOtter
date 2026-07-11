---
description: "使用 Real-ESRGAN AI 超解析度將影像放大 2 倍至 4 倍，同時保留細節。"
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 05379b6f9563
---

# 影像放大 {#image-upscaling}

使用 Real-ESRGAN 的 AI 超解析度增強。將影像放大 2 至 4 倍，同時保留細節。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 以取得狀態）

**模型套件：** `upscale-enhance`（5-6 GB）

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 影像檔案（multipart） |
| scale | number | 否 | `2` | 放大倍率（例如 2、3、4） |
| model | string | 否 | `"auto"` | 要使用的模型（例如 `auto`、特定模型名稱） |
| faceEnhance | boolean | 否 | `false` | 在放大過程中套用臉部增強 |
| denoise | number | 否 | `0` | 降噪強度（0 = 關閉） |
| format | string | 否 | `"auto"` | 輸出格式：`auto`、`png`、`jpg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | number | 否 | `95` | 輸出品質（1-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## 回應 {#response}

### 初始回應（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進度（SSE 位於 `/api/v1/jobs/{jobId}/progress`） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## 注意事項 {#notes}

- 需要安裝 `upscale-enhance` 模型套件（5-6 GB）。
- 在可用時使用 Real-ESRGAN；若 AI 模型不可用，則回退到 Lanczos 插值。
- `faceEnhance` 選項會在放大過程中套用 GFPGAN 臉部修復，以獲得更佳的臉部品質。
- 對於瀏覽器無法預覽的輸出格式（HEIC、JXL、TIFF），會在主要輸出旁另外產生 WebP 預覽。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
