---
description: "使用 AI 图像修复（LaMa）从图片中移除不需要的对象，由标注要擦除区域的蒙版引导。"
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 15f31fd8bd25
---

# 对象擦除 {#object-eraser}

使用 AI 图像修复（LaMa 模型）从图片中移除不需要的对象。接受一张图片和一张标注要擦除区域的蒙版。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `object-eraser-colorize`（1-2 GB）

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 源图片文件（multipart） |
| mask | file | 是 | - | 蒙版图片（白色 = 要擦除的区域，黑色 = 保留）。必须以字段名 `mask` 上传 |
| format | string | 否 | `"auto"` | 输出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | integer | 否 | `95` | 输出质量（1-100） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## 注意事项 {#notes}

- 需要安装 `object-eraser-colorize` 模型包（1-2 GB）。
- 蒙版必须与源图片尺寸相同。白色像素表示要擦除的区域；AI 会用合理的内容填充这些区域。
- 使用 LaMa（Large Mask Inpainting，大蒙版图像修复）实现高质量的对象移除。
- 对于无法在浏览器中预览的输出格式，会在主输出旁一并生成 WebP 预览。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
