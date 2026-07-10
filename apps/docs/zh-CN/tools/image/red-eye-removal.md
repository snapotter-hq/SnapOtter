---
description: "基于 AI 检测并修正相机闪光灯造成的红眼。"
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 4c47e6dbe7e2
---

# 红眼消除 {#red-eye-removal}

基于 AI 检测并修正相机闪光灯造成的红眼。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `face-detection`（200-300 MB）

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| sensitivity | number | 否 | `50` | 红眼检测灵敏度（0-100）。值越高，越能检测出更细微的红眼 |
| strength | number | 否 | `70` | 修正强度（0-100）。中和红色的力度 |
| format | string | 否 | - | 输出格式（可选覆盖） |
| quality | number | 否 | `90` | 输出质量（1-100） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
```

## 响应 {#response}

### 初始响应（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 进度（位于 `/api/v1/jobs/{jobId}/progress` 的 SSE） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## 说明 {#notes}

- 需要安装 `face-detection` 模型包（200-300 MB）。
- 先检测人脸，再定位每张脸内的眼睛区域，最后识别并修正红眼像素。
- `facesDetected` 数量表示找到了多少张人脸；`eyesCorrected` 是被修正了红眼的单只眼睛的总数。
- 输出始终为 PNG，以最大程度地保留质量。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
