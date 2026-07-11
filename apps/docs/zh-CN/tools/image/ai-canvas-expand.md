---
description: "使用 AI 外绘扩展图像画布，向任意方向延伸并填充与原图匹配的新区域。"
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: a0402622243c
---

# AI Canvas Expand {#ai-canvas-expand}

使用 AI 驱动的填充（外绘）扩展图像画布。向任意方向延伸图像，并用与现有图像匹配的 AI 生成内容填充新区域。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `object-eraser-colorize`（1-2 GB）

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图像文件（multipart） |
| extendTop | integer | 否 | `0` | 顶部要扩展的像素数 |
| extendRight | integer | 否 | `0` | 右侧要扩展的像素数 |
| extendBottom | integer | 否 | `0` | 底部要扩展的像素数 |
| extendLeft | integer | 否 | `0` | 左侧要扩展的像素数 |
| tier | string | 否 | `"balanced"` | 质量档位：`fast`、`balanced`、`high` |
| format | string | 否 | `"auto"` | 输出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | integer | 否 | `95` | 输出质量（1-100） |

至少有一个扩展方向必须大于 0。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes {#notes}

- 需要安装 `object-eraser-colorize` 模型包（1-2 GB）。
- 使用基于 LaMa 的外绘为扩展区域生成内容。
- `tier` 参数在速度和质量之间权衡：`fast` 能快速产出结果但可能有瑕疵，`high` 耗时更长但能产出更平滑、更连贯的填充。
- 扩展值以像素为单位。最终图像尺寸将为：原始宽度 + extendLeft + extendRight 乘以 原始高度 + extendTop + extendBottom。
- 对于浏览器无法预览的输出格式（HEIC、JXL、TIFF），会在主输出旁生成一个 WebP 预览。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
