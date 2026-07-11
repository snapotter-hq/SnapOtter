---
description: "基于 AI 的降噪和去颗粒处理，提供多档质量选项。"
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 43d042c4f560
---

# 降噪 {#noise-removal}

基于 AI 的降噪和去颗粒处理，提供多档质量选项，使用 Python 边车（SCUNet 模型）。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `upscale-enhance`（5-6 GB）

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| tier | string | 否 | `"balanced"` | 质量档位：`quick`、`balanced`、`quality`、`maximum` |
| strength | number | 否 | `50` | 降噪强度（0-100） |
| detailPreservation | number | 否 | `50` | 保留细节的程度（0-100）。值越高保留的纹理越多 |
| colorNoise | number | 否 | `30` | 彩色噪点抑制强度（0-100） |
| format | string | 否 | `"original"` | 输出格式：`original`、`png`、`jpeg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | `90` | 输出编码质量（1-100） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## 说明 {#notes}

- 需要安装 `upscale-enhance` 模型包（5-6 GB）。
- 质量档位在速度和质量之间权衡：`quick` 最快，仅做基础降噪；`maximum` 采用最彻底的多轮处理方式。
- 对于有纹理的主体（布料、头发、树叶），`detailPreservation` 参数至关重要。较高的值可防止降噪器抹平细微的细节。
- 当 `format` 设为 `"original"` 时，输出格式与输入文件格式一致。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
