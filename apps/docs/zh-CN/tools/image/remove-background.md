---
description: "基于 AI 的背景去除，可选特效（模糊、阴影、渐变、自定义背景）。"
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: fdb2d2307e44
---

# 背景去除 {#remove-background}

基于 AI 的背景去除，可选特效（模糊、阴影、渐变、自定义背景）。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `background-removal`（4-5 GB）

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| model | string | 否 | - | 要使用的 AI 模型变体 |
| backgroundType | string | 否 | `"transparent"` | 以下之一：`transparent`、`color`、`gradient`、`blur`、`image` |
| backgroundColor | string | 否 | - | 纯色背景的十六进制颜色 |
| gradientColor1 | string | 否 | - | 第一个渐变颜色 |
| gradientColor2 | string | 否 | - | 第二个渐变颜色 |
| gradientAngle | number | 否 | - | 渐变角度（度） |
| blurEnabled | boolean | 否 | - | 启用背景模糊效果 |
| blurIntensity | number | 否 | - | 模糊强度（0-100） |
| shadowEnabled | boolean | 否 | - | 在主体上启用投影 |
| shadowOpacity | number | 否 | - | 阴影不透明度（0-100） |
| outputFormat | string | 否 | - | 输出格式：`png`、`webp` 或 `avif` |
| edgeRefine | integer | 否 | - | 边缘细化级别（0-3） |
| decontaminate | boolean | 否 | - | 移除边缘的颜色溢出 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## 特效端点（阶段 2） {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

在不重新运行 AI 模型的情况下重新应用背景特效。使用阶段 1 的缓存蒙版和原图。

### 参数 {#parameters-1}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| settings | JSON | 是 | - | 包含特效设置的 JSON（见下文） |
| backgroundImage | file | 否 | - | 自定义背景图片（当 backgroundType 为 `image` 时） |

#### 设置 JSON 字段 {#settings-json-fields}

| 字段 | 类型 | 是否必填 | 说明 |
|-------|------|----------|-------------|
| jobId | string | 是 | 阶段 1 返回的任务 ID |
| filename | string | 是 | 阶段 1 的原始文件名 |
| backgroundType | string | 否 | `transparent`、`color`、`gradient`、`blur`、`image` |
| backgroundColor | string | 否 | 纯色背景的十六进制颜色 |
| gradientColor1 | string | 否 | 第一个渐变颜色 |
| gradientColor2 | string | 否 | 第二个渐变颜色 |
| gradientAngle | number | 否 | 渐变角度（度） |
| blurEnabled | boolean | 否 | 启用背景模糊 |
| blurIntensity | number | 否 | 模糊强度（0-100） |
| shadowEnabled | boolean | 否 | 启用投影 |
| shadowOpacity | number | 否 | 阴影不透明度（0-100） |
| outputFormat | string | 否 | `png`、`webp` 或 `avif` |

### 请求示例 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### 响应（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## 说明 {#notes}

- 需要安装 `background-removal` 模型包（4-5 GB）。
- 阶段 1 会缓存透明蒙版和原图，以便阶段 2（特效）能够即时重新应用不同的背景，无需重新运行 AI 模型。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
- 处理前会自动校正 EXIF 旋转。
