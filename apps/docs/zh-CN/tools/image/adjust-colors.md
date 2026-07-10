---
description: "调整亮度、对比度、饱和度、色温、色相、通道，并应用色彩效果。"
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 9ced0c9b42f2
---

# Adjust Colors {#adjust-colors}

综合性的色彩调整工具，在单一端点中集合了亮度、对比度、曝光、饱和度、色温、着色、色相旋转、逐通道级别以及一键效果（灰度、棕褐、反相）。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

接受包含图像文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | 否 | `0` | 亮度调整（-100 到 100） |
| contrast | number | 否 | `0` | 对比度调整（-100 到 100） |
| exposure | number | 否 | `0` | 曝光 / 中间调伽马（-100 到 100） |
| saturation | number | 否 | `0` | 色彩饱和度（-100 到 100） |
| temperature | number | 否 | `0` | 白平衡：冷/蓝到暖/橙（-100 到 100） |
| tint | number | 否 | `0` | 着色偏移：绿到品红（-100 到 100） |
| hue | number | 否 | `0` | 色相旋转（角度，-180 到 180） |
| sharpness | number | 否 | `0` | 锐化强度（0 到 100） |
| red | number | 否 | `100` | 红色通道级别（0 到 200，100 = 不变） |
| green | number | 否 | `100` | 绿色通道级别（0 到 200，100 = 不变） |
| blue | number | 否 | `100` | 蓝色通道级别（0 到 200，100 = 不变） |
| effect | string | 否 | `"none"` | 色彩效果：`none`、`grayscale`、`sepia`、`invert` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

应用温暖的复古效果：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- 所有参数都默认为中性值，因此你只需调整所需的部分。
- 调整按以下顺序应用：亮度、对比度、曝光、饱和度/色相、色温/着色、锐化、通道、效果。
- 色温在蓝橙轴和绿品红轴上使用 3x3 色彩重组矩阵。
- 曝光映射到 Sharp 的伽马函数（正值提亮中间调，负值压暗它们）。
- 此端点也响应旧路径 `/api/v1/tools/image/brightness-contrast`、`/api/v1/tools/image/saturation`、`/api/v1/tools/image/color-channels` 和 `/api/v1/tools/image/color-effects`。它们都使用相同的 schema。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
