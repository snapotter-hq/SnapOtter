---
description: "一键自动增强，分析图像并校正曝光、对比度、白平衡、饱和度和锐度。"
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 4011ac2b629b
---

# 图像增强 {#image-enhancement}

通过智能分析实现一键自动改善。分析图像并应用曝光、对比度、白平衡、饱和度、锐度和降噪校正。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**处理方式：** 同步（使用 `createToolRoute` 工厂，直接返回结果）

**模型包：** 基础增强无需模型包。仅当启用 `deepEnhance` 时才使用 `upscale-enhance` 包（5-6 GB）（用于通过 SCUNet 进行 AI 降噪）。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图像文件（multipart） |
| mode | string | 否 | `"auto"` | 增强模式：`auto`、`portrait`、`landscape`、`low-light`、`food`、`document` |
| intensity | number | 否 | `50` | 整体增强强度（0-100） |
| corrections | object | 否 | 全部 `true` | 要应用的可选校正项（见下文） |
| deepEnhance | boolean | 否 | `false` | 启用 AI 驱动的降噪（需要安装 `noise-removal` 工具） |

### Corrections 对象 {#corrections-object}

| 字段 | 类型 | 默认值 | 说明 |
|-------|------|---------|-------------|
| exposure | boolean | `true` | 自动校正曝光 |
| contrast | boolean | `true` | 自动校正对比度 |
| whiteBalance | boolean | `true` | 自动校正白平衡 |
| saturation | boolean | `true` | 自动校正饱和度 |
| sharpness | boolean | `true` | 自动锐化 |
| denoise | boolean | `true` | 轻度降噪 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## 响应（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze 端点 {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

分析图像并返回校正建议，但不实际应用。

### 参数 {#parameters-1}

| 参数 | 类型 | 是否必填 | 说明 |
|-----------|------|----------|-------------|
| file | file | 是 | 图像文件（multipart） |

### 请求示例 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### 响应（200 OK） {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## 说明 {#notes}

- 此工具使用同步的 `createToolRoute` 工厂，因此返回标准响应（而非 202 异步）。
- `mode` 参数会调整各项校正的权重（例如，人像模式对肤色更温和，风景模式会提升饱和度）。
- 当启用 `deepEnhance` 且已安装 `noise-removal` 工具（SCUNet）时，会在标准校正之后额外应用一次 AI 降噪处理。
- analyze 端点在正式应用前，可用于预览将会应用哪些校正。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
