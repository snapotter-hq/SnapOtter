---
description: "使用 GFPGAN 和 CodeFormer AI 模型修复并锐化图片中模糊或低质量的人脸。"
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: e599fd8468f7
---

# 人脸增强 {#face-enhancement}

使用 AI 模型（GFPGAN/CodeFormer）修复并增强图片中的人脸。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `upscale-enhance`（5-6 GB）和 `face-detection`（200-300 MB）

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| model | string | 否 | `"auto"` | 使用的模型：`auto`、`gfpgan`、`codeformer` |
| strength | number | 否 | `0.8` | 增强强度（0-1）。值越高增强越强 |
| onlyCenterFace | boolean | 否 | `false` | 仅增强最居中/最突出的人脸 |
| sensitivity | number | 否 | `0.5` | 人脸检测灵敏度（0-1） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## 响应 {#response}

### 初始响应（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 进度（SSE 位于 `/api/v1/jobs/{jobId}/progress`） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## 注意事项 {#notes}

- 需要同时安装 `upscale-enhance` 模型包（5-6 GB）和 `face-detection` 模型包（200-300 MB）。
- GFPGAN 产生更激进的增强；CodeFormer 更好地保留身份特征。`auto` 会为输入选择最佳模型。
- 输出始终为 PNG 格式，以获得最高质量。
- 会在全分辨率输出旁一并生成 WebP 预览，以加快前端显示。
- `strength` 参数将增强后的人脸与原始人脸混合。使用较低的值（0.3-0.5）获得细微改善，使用较高的值（0.7-1.0）获得更强的修复。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
