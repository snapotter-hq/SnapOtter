---
description: "以 AI 臉部偵測自動偵測並模糊影像中的臉部，用於隱私保護及符合 GDPR 的匿名化。"
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: 94edf3daf65b
---

# 模糊臉部與隱私資訊 {#face-pii-blur}

使用 AI 驅動的臉部偵測（MediaPipe）自動偵測並模糊影像中的臉部。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 取得狀態）

**模型套件：** `face-detection`（200-300 MB）

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 影像檔案（multipart） |
| blurRadius | number | No | `30` | 套用於偵測到臉部的模糊半徑（1-100） |
| sensitivity | number | No | `0.5` | 臉部偵測靈敏度（0-1）。較低的值以較高的信心偵測較少的臉部 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### No Faces Detected {#no-faces-detected}

若未找到臉部，結果會包含一則警告：

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Notes {#notes}

- 需要安裝 `face-detection` 模型套件（200-300 MB）。
- 輸出格式會自動與輸入格式相符。
- `faces` 陣列包含每個偵測到臉部的邊界框座標（x、y、width、height）。
- 增加 `sensitivity`（越接近 1.0）以偵測更多臉部，包含部分被遮擋的臉部。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 及 HDR 輸入格式。
