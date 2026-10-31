---
description: "基于 AI 的背景去除，可选特效（模糊、阴影、渐变、自定义背景）。"
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 432ac69cd77a
---

# 背景去除 {#remove-background}

基于 AI 的背景去除，可选特效（模糊、阴影、渐变、自定义背景）。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** `background-removal`（4-5 GB）

## 参数 {#parameters}

阶段 1 会移除背景，并缓存透明 PNG 蒙版和原图。背景替换、模糊、投影和输出格式转换会在[阶段 2（`/api/v1/tools/image/remove-background/effects`）](#effects-endpoint-phase-2)中应用（将 `remove-background` 作为流水线步骤或批处理作业运行时也是如此）；把这些字段传给阶段 1 会返回 400。

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| model | string | 否 | - | 要使用的 AI 模型变体 |
| edgeRefine | integer | 否 | - | 边缘细化级别（0-3） |
| decontaminate | boolean | 否 | - | 移除边缘的颜色溢出 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
| backgroundImage | file | 当 `backgroundType` 为 `image` 时必填 | - | 自定义背景图片 |

#### 设置 JSON 字段 {#settings-json-fields}

| 字段 | 类型 | 是否必填 | 默认值 | 说明 |
|-------|------|----------|---------|-------------|
| jobId | string | 是 | - | 阶段 1 返回的任务 ID |
| filename | string | 是 | - | 阶段 1 的原始文件名 |
| backgroundType | string | 否 | `"transparent"` | 以下之一：`transparent`、`color`、`gradient`、`blur`、`image` |
| backgroundColor | string | 当 `backgroundType` 为 `color` 时必填 | - | 十六进制颜色：`#RRGGBB` 或 `#RGB`（`#` 可省略） |
| gradientColor1 | string | 当 `backgroundType` 为 `gradient` 时必填 | - | 第一个渐变颜色，十六进制格式同 `backgroundColor` |
| gradientColor2 | string | 当 `backgroundType` 为 `gradient` 时必填 | - | 第二个渐变颜色，十六进制格式同 `backgroundColor` |
| gradientAngle | number | 否 | - | 渐变角度（度） |
| blurEnabled | boolean | 否 | - | 模糊主体背后的原始背景（`backgroundType: "blur"` 会隐含启用） |
| blurIntensity | number | 否 | - | 模糊强度（0-100） |
| shadowEnabled | boolean | 否 | - | 在主体上启用投影 |
| shadowOpacity | number | 否 | `35` | 阴影不透明度（0-100），在 `shadowEnabled` 为 true 时使用 |
| outputFormat | string | 否 | `"png"` | 输出格式：`png`、`webp` 或 `avif` |

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

#### 错误：背景去除已过期（410） {#error-background-removal-expired-410}

特效端点基于阶段 1 为 `jobId` 存储的蒙版和原图工作。存储的输出会在一段时间后被清理，因此如果两次调用之间间隔太久，它们就已不存在。请用同一张图片再次运行阶段 1，并使用它返回的 `jobId`。

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

无法指代已存储文件的 `jobId` 或 `filename`（包含路径分隔符、`..` 或空字符串）会返回 400。

## 说明 {#notes}

- 需要安装 `background-removal` 模型包（4-5 GB）。
- 阶段 1 会缓存透明蒙版和原图，以便阶段 2（特效）能够即时重新应用不同的背景，无需重新运行 AI 模型。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
- 处理前会自动校正 EXIF 旋转。
