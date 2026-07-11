---
description: "使用 Real-ESRGAN AI 超分辨率将图像放大 2 到 4 倍，同时保留细节。"
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 464013380e6f
---

# 图像放大 {#image-upscaling}

使用 Real-ESRGAN 进行 AI 超分辨率增强。将图像放大 2 到 4 倍，同时保留细节。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `upscale-enhance`（5-6 GB）

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图像文件（multipart） |
| scale | number | 否 | `2` | 放大倍数（例如 2、3、4） |
| model | string | 否 | `"auto"` | 使用的模型（例如 `auto`、具体模型名称） |
| faceEnhance | boolean | 否 | `false` | 在放大过程中应用人脸增强 |
| denoise | number | 否 | `0` | 降噪强度（0 = 关闭） |
| format | string | 否 | `"auto"` | 输出格式：`auto`、`png`、`jpg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | number | 否 | `95` | 输出质量（1-100） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## 响应 {#response}

### 初始响应（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 进度（SSE，位于 `/api/v1/jobs/{jobId}/progress`） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

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

## 说明 {#notes}

- 需要安装 `upscale-enhance` 模型包（5-6 GB）。
- 可用时使用 Real-ESRGAN；如果 AI 模型不可用，则回退到 Lanczos 插值。
- `faceEnhance` 选项在放大过程中应用 GFPGAN 人脸修复，以获得更好的人脸质量。
- 对于非浏览器可预览的输出格式（HEIC、JXL、TIFF），会在主输出之外生成 WebP 预览。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
