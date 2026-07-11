---
description: "使用 DDColor AI 模型自動為黑白或灰階照片上色。"
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: d66d34310fd5
---

# AI 上色 {#ai-colorization}

使用 AI（DDColor 模型，並以 OpenCV DNN 作為後備）將黑白或灰階照片轉換為全彩。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 取得狀態）

**模型套件：** `object-eraser-colorize`（1-2 GB）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| intensity | number | 否 | `1.0` | 色彩強度（0-1）。數值越低，上色越細膩 |
| model | string | 否 | `"auto"` | 要使用的模型：`auto`、`ddcolor`、`opencv` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## 備註 {#notes}

- 需要安裝 `object-eraser-colorize` 模型套件（1-2 GB）。
- DDColor 產生的結果品質較高但較慢；OpenCV DNN 較快但品質略低。`auto` 會在 DDColor 可用時使用它，並以 OpenCV 作為後備。
- `intensity` 參數會在原始灰階與 AI 上色結果之間混合。使用 1.0 表示全彩，較低的數值則呈現部分去飽和的復古效果。
- 輸出格式會自動與輸入格式相符。
- 對於瀏覽器無法預覽的輸出格式，會在主要輸出旁一併產生 WebP 預覽。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
