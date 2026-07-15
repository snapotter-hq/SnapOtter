---
description: "使用自适应、USM 锐化或高通方法锐化图像，并可选降噪。"
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: 8096d6bf1ecd
---

# 锐化图片 {#sharpening}

提供三种方法的高级锐化工具：自适应（智能边缘感知）、USM 锐化（经典的半径/强度）和高通（纹理强化）。内置降噪功能，可防止锐化产生伪影。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

接受包含图像文件和 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| method | string | 否 | `"adaptive"` | 锐化算法：`adaptive`、`unsharp-mask`、`high-pass` |
| sigma | number | 否 | `1.0` | 自适应：高斯 sigma（0.5 到 10） |
| m1 | number | 否 | `1.0` | 自适应：平坦区域锐化（0 到 10） |
| m2 | number | 否 | `3.0` | 自适应：锯齿区域锐化（0 到 20） |
| x1 | number | 否 | `2.0` | 自适应：平坦/锯齿阈值（0 到 10） |
| y2 | number | 否 | `12` | 自适应：最大平坦锐化（0 到 50） |
| y3 | number | 否 | `20` | 自适应：最大锯齿锐化（0 到 50） |
| amount | number | 否 | `100` | USM 锐化：锐化强度（0 到 1000） |
| radius | number | 否 | `1.0` | USM 锐化：模糊半径（像素，0.1 到 5） |
| threshold | number | 否 | `0` | USM 锐化：触发锐化的最小亮度差（0 到 255） |
| strength | number | 否 | `50` | 高通：滤波强度（0 到 100） |
| kernelSize | number | 否 | `3` | 高通：卷积核大小（3 或 5） |
| denoise | string | 否 | `"off"` | 锐化前降噪：`off`、`light`、`medium`、`strong` |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

使用阈值保护平滑区域的 USM 锐化：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## 说明 {#notes}

- 仅使用与所选方法相关的参数。例如，当 `method` 为 `adaptive` 时，`amount`、`radius` 和 `threshold` 会被忽略。
- 自适应方法使用 Sharp 内置的自适应锐化，可配置平坦/锯齿区域的行为。
- `denoise` 选项在锐化前应用降噪，以防止放大噪点/颗粒。
- 高通锐化通过从原图中减去模糊版本来提取细节，然后再混合回原图。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
