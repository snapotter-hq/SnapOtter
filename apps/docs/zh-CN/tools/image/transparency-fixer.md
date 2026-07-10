---
description: "使用 AI 抠图（BiRefNet）修复伪透明 PNG，生成真正的 alpha 通道，并进行去边缘杂色清理。"
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: bf179732f8ea
---

# PNG 透明度修复器 {#png-transparency-fixer}

一键修复伪透明 PNG。使用 AI 抠图（BiRefNet HR Matting 模型）生成真正的 alpha 透明度，并通过去边缘后处理清理边缘。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `background-removal`（4-5 GB）

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图像文件（multipart） |
| defringe | number | 否 | `30` | 去边缘强度（0-100）。移除边缘周围的半透明杂色像素 |
| outputFormat | string | 否 | `"png"` | 输出格式：`png` 或 `webp` |
| removeWatermark | boolean | 否 | `false` | 应用水印移除预处理（中值滤波） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## 说明 {#notes}

- 需要安装 `background-removal` 模型包（4-5 GB）。
- 使用 `birefnet-hr-matting` 作为高质量 alpha 抠图的主模型。如果 HR 模型内存不足，则回退到 `birefnet-general`。
- `defringe` 选项移除 AI 抠图有时在头发、毛发和细边缘周围留下的半透明杂色像素。其原理是模糊 alpha 通道并将低置信度像素置零。
- `removeWatermark` 选项应用中值滤波预处理步骤。这是一种基础的水印削弱，而非专用的水印移除工具。
- 仅输出 PNG 或无损 WebP（两者都支持 alpha 透明度）。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
