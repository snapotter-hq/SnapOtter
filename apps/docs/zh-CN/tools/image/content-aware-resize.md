---
description: "基于接缝裁剪的缩放，沿低重要性路径增删像素，以保留关键内容和人脸。"
i18n_source_hash: a4adf011b2bd
i18n_provenance: human
i18n_output_hash: 2bc515137f68
---

# 内容感知缩放 {#content-aware-resize}

基于接缝裁剪的缩放，智能地沿视觉重要性最低的路径删除或增加像素，保留重要内容并可选地保护人脸。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**处理方式：** 异步（返回 202，通过 SSE 轮询 `/api/v1/jobs/{jobId}/progress` 获取状态）

**模型包：** 基本操作无需模型包。如果启用人脸保护，则使用 `face-detection` 模型包（200-300 MB）。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 图片文件（multipart） |
| width | number | 否 | - | 目标宽度，单位像素 |
| height | number | 否 | - | 目标高度，单位像素 |
| protectFaces | boolean | 否 | `false` | 检测并保护人脸，避免被接缝删除 |
| blurRadius | number | 否 | `4` | 用于能量计算的预处理模糊半径（0-20） |
| sobelThreshold | number | 否 | `2` | Sobel 边缘检测阈值（1-20）。值越高算法越激进 |
| square | boolean | 否 | `false` | 缩放为正方形（使用较小的一边） |

必须至少指定 `width`、`height` 或 `square` 之一。

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## 响应 {#response}

### 初始响应（202 Accepted） {#initial-response-202-accepted}

```json
{
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 最终结果（通过 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
    "originalSize": 450000,
    "processedSize": 380000,
    "width": 800,
    "height": 600
  }
}
```

## 注意事项 {#notes}

- 使用 `caire` 接缝裁剪库进行内容感知缩放。
- 通过删除接缝缩小，或通过插入接缝放大。每条边最多可放大到原始尺寸的 2 倍。
- `protectFaces` 选项使用 AI 人脸检测将人脸区域标记为高能量，防止接缝穿过人脸。
- `blurRadius` 控制能量图计算前的平滑程度。较高的值会使能量图更均匀，这有助于处理噪点较多的图片。
- `sobelThreshold` 影响边缘检测的激进程度。较低的值会保留更多细微的边缘。
- 输出始终为 PNG 格式。
- 通过自动解码支持 HEIC/HEIF、RAW、TGA、PSD、EXR 和 HDR 输入格式。
