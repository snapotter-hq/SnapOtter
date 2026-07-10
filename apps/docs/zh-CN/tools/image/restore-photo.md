---
description: "使用 AI 流水线修复旧照片上的划痕、破损和损伤，进行修复、人脸增强和上色。"
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: af039536e891
---

# 照片修复 {#photo-restoration}

使用多步骤 AI 流水线修复旧照片上的划痕、破损和损伤。整合了划痕修复、人脸增强、降噪以及可选的上色。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `photo-restoration`（4-5 GB）

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| scratchRemoval | boolean | 否 | `true` | 移除划痕和表面损伤 |
| faceEnhancement | boolean | 否 | `true` | 增强修复后照片中的人脸 |
| fidelity | number | 否 | `0.7` | 人脸增强保真度（0-1）。值越高越多地保留原始特征 |
| denoise | boolean | 否 | `true` | 对修复结果应用降噪 |
| denoiseStrength | number | 否 | `25` | 降噪强度（0-100） |
| colorize | boolean | 否 | `false` | 为修复后的照片上色（针对灰度图片） |
| colorizeStrength | number | 否 | `85` | 上色强度（0-100） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

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
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## 说明 {#notes}

- 需要安装 `photo-restoration` 模型包（4-5 GB）。
- 该流水线依次运行多个 AI 步骤：划痕修复、人脸增强（GFPGAN）、降噪，以及可选的上色。
- 结果中的 `steps` 数组显示实际执行了哪些处理步骤。
- `scratchCoverage` 是有划痕损伤的图片面积的估算百分比。
- `fidelity` 控制人脸增强的强度与保留原始外观之间的权衡。较低的值产生更激进的增强；较高的值更为保守。
- `colorize` 选项会自动检测图片是否为灰度。结果中的 `isGrayscale` 标志确认此项检测。
- 输出格式会自动与输入格式一致。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR、HDR 和 AVIF 输入格式。
