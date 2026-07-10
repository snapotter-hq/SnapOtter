---
description: "基于 AI 的护照和证件照生成器，具备人脸检测、背景去除和打印排版拼贴功能。"
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 8f1a76094628
---

# 护照照片 {#passport-photo}

基于 AI 的护照和证件照生成器。采用两阶段工作流：先分析（人脸检测 + 背景去除），再生成（裁剪、调整尺寸并拼贴以供打印）。

## API 端点 {#api-endpoints}

该工具采用两阶段流程，分析和生成使用各自独立的端点。

**模型包：** `background-removal` 和 `face-detection`

---

### 阶段 1：分析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

检测人脸特征点并去除背景。返回特征点数据和一张预览图，供前端显示裁剪预览。

#### 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| clientJobId | string | 否 | - | 可选的任务 ID，用于通过 SSE 跟踪进度 |

#### 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### 响应（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### 进度（SSE，可选） {#progress-sse-optional}

若提供了 `clientJobId`，则会流式传输进度（人脸检测为 0-30%，背景去除为 30-95%）。

#### 错误：未检测到人脸（422） {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### 阶段 2：生成 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

裁剪、调整尺寸，并可选地将照片拼贴到打印排版上。使用阶段 1 的缓存图片（不重新运行 AI）。

#### 参数（JSON 请求体） {#parameters-json-body}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| jobId | string | 是 | - | 阶段 1 返回的任务 ID |
| filename | string | 是 | - | 阶段 1 的原始文件名 |
| countryCode | string | 是 | - | 护照规格的国家代码（例如 `US`、`GB`、`IN`） |
| documentType | string | 否 | `"passport"` | 证件类型（来自国家规格） |
| bgColor | string | 否 | `"#FFFFFF"` | 背景颜色十六进制值 |
| printLayout | string | 否 | `"none"` | 打印纸张排版：`none`、`4x6`、`a4` |
| maxFileSizeKb | number | 否 | `0` | 最大文件大小限制（KB，0 = 无限制） |
| dpi | number | 否 | `300` | 输出 DPI（72-1200） |
| customWidthMm | number | 否 | - | 自定义照片宽度（毫米，覆盖国家规格） |
| customHeightMm | number | 否 | - | 自定义照片高度（毫米，覆盖国家规格） |
| zoom | number | 否 | `1` | 缩放系数（0.5-3）。值 > 1 时裁剪得更紧 |
| adjustX | number | 否 | `0` | 水平位置调整 |
| adjustY | number | 否 | `0` | 垂直位置调整 |
| landmarks | object | 是 | - | 来自阶段 1 响应的特征点对象 |
| imageWidth | number | 是 | - | 来自阶段 1 响应的图片宽度 |
| imageHeight | number | 是 | - | 来自阶段 1 响应的图片高度 |

#### 请求示例 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### 响应（200 OK） {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### 基础路由 {#base-route}

`POST /api/v1/tools/image/passport-photo`

返回引导信息，提示使用正确的子端点。

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## 说明 {#notes}

- 需要安装 `background-removal` 和 `face-detection` 模型包。
- 阶段 1 运行 AI（人脸特征点 + 背景去除）并缓存结果。阶段 2 是纯 Sharp 图片处理（快速，无需 AI）。
- 特征点以归一化坐标形式返回（相对于图片尺寸的 0-1 范围）。
- 分析响应中的 `preview` 字段是一张 base64 编码的 PNG（最大宽度 800px），用于快速显示。
- 国家规格包含证件尺寸、头部高度比例以及基于官方护照照片要求的视线定位。
- `printLayout` 选项会在 4x6 英寸或 A4 纸上生成拼贴排版，照片之间留有 2mm 的间隙。
- 设置 `maxFileSizeKb` 时，输出会经过迭代压缩以符合大小限制。
