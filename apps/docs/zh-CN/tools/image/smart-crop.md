---
description: "基于主体、人脸和熵的裁剪，使用 Sharp 和 AI 人脸检测智能地为图像取景。"
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: f0dcbc7bcece
---

# 智能裁剪 {#smart-crop}

智能的主体感知、人脸感知或基于修剪的裁剪。使用 Sharp 的注意力/熵策略和 AI 人脸检测实现智能取景。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `face-detection`（200-300 MB）- 仅 `face` 模式需要

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图像文件（multipart） |
| mode | string | 否 | `"subject"` | 裁剪模式：`subject`、`face`、`trim`。（旧值 `attention` 和 `content` 分别映射到 `subject` 和 `trim`） |
| strategy | string | 否 | `"attention"` | 主体模式的策略：`attention` 或 `entropy` |
| width | integer | 否 | - | 目标宽度（像素） |
| height | integer | 否 | - | 目标高度（像素） |
| padding | integer | 否 | `0` | 主体周围的内边距百分比（0-50） |
| facePreset | string | 否 | `"head-shoulders"` | 人脸取景预设：`closeup`、`head-shoulders`、`upper-body`、`half-body` |
| sensitivity | number | 否 | `0.5` | 人脸检测灵敏度（0-1） |
| threshold | integer | 否 | `30` | 修剪模式下的背景检测阈值（0-255） |
| padToSquare | boolean | 否 | `false` | 将修剪后的结果填充为正方形 |
| padColor | string | 否 | `"#ffffff"` | 填充用的背景颜色 |
| targetSize | integer | 否 | - | 填充输出的目标尺寸（像素） |
| quality | integer | 否 | - | 输出质量（1-100） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## 模式 {#modes}

### 主体模式 {#subject-mode}
使用 Sharp 的注意力或熵策略找到视觉上最有趣的区域，并围绕它进行裁剪。

### 人脸模式 {#face-mode}
使用 AI 检测人脸，然后根据指定的 `facePreset` 围绕检测到的人脸取景裁剪。如果未检测到人脸，则回退到主体模式（注意力策略）。

### 修剪模式 {#trim-mode}
移除图像中均匀的边框/背景。可选地使用指定的背景颜色和目标尺寸将结果填充为正方形。

## 说明 {#notes}

- 该工具使用带 `executionHint: "long"` 的 `createToolRoute` 工厂，因此返回 202 并附带 SSE 进度。
- 人脸模式需要 `face-detection` 模型包（200-300 MB）。
- 主体模式和修剪模式无需任何 AI 模型包即可工作。
- `facePreset` 决定裁剪对检测到的人脸取景的紧密程度：`closeup` 最紧凑，`half-body` 最宽松。
- 如果未指定宽度/高度，则默认为 1080x1080。
