---
description: "使用 DDColor AI 模型自动为黑白或灰度照片上色。"
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 2a1f7ac8236f
---

# AI 上色 {#ai-colorization}

使用 AI（DDColor 模型，以 OpenCV DNN 作为回退方案）将黑白或灰度照片转换为全彩。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `object-eraser-colorize`（1-2 GB）

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| intensity | number | 否 | `1.0` | 颜色强度（0-1）。较低的值会产生更柔和的上色效果 |
| model | string | 否 | `"auto"` | 使用的模型：`auto`、`ddcolor`、`opencv` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

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

## 注意事项 {#notes}

- 需要安装 `object-eraser-colorize` 模型包（1-2 GB）。
- DDColor 产生更高质量的结果但较慢；OpenCV DNN 更快，质量略低。`auto` 在可用时使用 DDColor，并以 OpenCV 作为回退方案。
- `intensity` 参数在原始灰度与 AI 上色结果之间进行混合。使用 1.0 获得全彩效果，较低的值可获得部分去饱和的复古外观。
- 输出格式会自动与输入格式一致。
- 对于无法在浏览器中预览的输出格式，会在主输出旁一并生成 WebP 预览。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
