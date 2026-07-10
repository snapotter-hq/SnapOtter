---
description: "将位图图像转换为 SVG，支持黑白（potrace）和全彩多层矢量化。"
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 9bd31316b327
---

# 图像转 SVG {#image-to-svg}

使用追踪算法将位图图像矢量化为 SVG。支持黑白追踪（potrace）和全彩多层矢量化。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| colorMode | string | 否 | `"bw"` | 追踪模式：`bw`（黑白）或 `color`（多色图层） |
| threshold | number | 否 | 128 | 黑白模式的亮度阈值（0 到 255）。低于此值的像素变为黑色。 |
| colorPrecision | number | 否 | 6 | 彩色模式的颜色量化精度（1 到 16）。值越高产生的独立色层越多。 |
| layerDifference | number | 否 | 6 | 彩色模式下图层之间的最小颜色差异（1 到 128） |
| filterSpeckle | number | 否 | 4 | 追踪形状的最小面积（像素，1 到 256）。移除噪点/斑点。 |
| pathMode | string | 否 | `"spline"` | 路径平滑：`none`（锯齿）、`polygon`（直线段）、`spline`（平滑曲线） |
| cornerThreshold | number | 否 | 60 | 彩色模式下角点检测的角度阈值（0 到 180 度） |
| invert | boolean | 否 | `false` | 追踪前反转图像（交换黑白） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### 彩色矢量化 {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## 说明 {#notes}

- 无论输入格式如何，输出始终为 SVG 文件。
- 支持 HEIC、RAW、PSD 和 SVG 输入格式（在追踪前自动解码为位图）。
- 黑白模式使用 potrace 算法。图像先转换为灰度，然后在追踪前进行阈值化处理为纯黑白。
- 彩色模式采用多层方法：图像被量化为多个色层，每层单独追踪并在 SVG 输出中堆叠。
- 较低的 `filterSpeckle` 值保留更多细节，但会产生路径更多、体积更大的 SVG 文件。
- `pathMode` 设置对文件大小影响显著：`none` 产生最多的路径，`spline` 产生最平滑（通常也是最小）的输出。
- 对于徽标和图标，使用黑白模式配合干净的高对比度输入可获得最佳效果。对于照片或插图，使用彩色模式并配合较高的 `colorPrecision`。
