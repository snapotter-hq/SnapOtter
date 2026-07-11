---
description: "使用 AI 人脸检测自动识别并模糊图像中的人脸，用于隐私保护和符合 GDPR 的匿名化。"
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: 3a0007f60b8a
---

# Face / PII Blur {#face-pii-blur}

使用 AI 驱动的人脸检测（MediaPipe）自动识别并模糊图像中的人脸。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `face-detection`（200-300 MB）

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图像文件（multipart） |
| blurRadius | number | 否 | `30` | 应用于检测到人脸的模糊半径（1-100） |
| sensitivity | number | 否 | `0.5` | 人脸检测灵敏度（0-1）。值越低，检测到的人脸越少但置信度越高 |

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

如果未找到人脸，结果会包含一条警告：

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

- 需要安装 `face-detection` 模型包（200-300 MB）。
- 输出格式会自动与输入格式一致。
- `faces` 数组包含每个检测到人脸的边界框坐标（x、y、width、height）。
- 提高 `sensitivity`（接近 1.0）可检测更多人脸，包括部分遮挡的人脸。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
