---
description: "AI 顔検出で画像内の顔を自動検出してぼかし、プライバシー保護と GDPR に準拠した匿名化を行います。"
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: a863b71fd7e4
---

# Face / PII Blur {#face-pii-blur}

AI 対応の顔検出 (MediaPipe) を使用して、画像内の顔を自動検出してぼかします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**処理:** 非同期 (202 を返し、SSE でステータスを `/api/v1/jobs/{jobId}/progress` からポーリング)

**モデルバンドル:** `face-detection` (200 ～ 300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル (マルチパート) |
| blurRadius | number | No | `30` | 検出された顔に適用するぼかし半径 (1 ～ 100) |
| sensitivity | number | No | `0.5` | 顔検出の感度 (0 ～ 1)。値が低いほど、より高い信頼度で検出する顔が少なくなります |

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

顔が見つからない場合、結果に警告が含まれます:

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

- `face-detection` モデルバンドルのインストールが必要です (200 ～ 300 MB)。
- 出力形式は入力形式に自動的に一致します。
- `faces` 配列には、検出された各顔のバウンディングボックス座標 (x、y、width、height) が含まれます。
- 部分的に隠れている顔を含め、より多くの顔を検出するには `sensitivity` を上げてください (1.0 に近づける)。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力形式を自動デコードでサポートします。
