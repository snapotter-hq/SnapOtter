---
description: "添加暗角效果，可调整强度、颜色和位置。"
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 3006e6b25805
---

# 暗角 {#vignette}

添加使图像边缘变暗或着色的暗角效果。支持可调整的强度、颜色、半径、柔和度、圆度和中心位置。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/vignette`

接受包含图像文件和 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| strength | number | 否 | `0.5` | 暗角不透明度（0.1-1） |
| color | string | 否 | `"#000000"` | 暗角十六进制颜色 |
| radius | integer | 否 | `70` | 外半径，占半对角线的百分比（0-100） |
| softness | integer | 否 | `50` | 羽化柔和度（0-100）；值越高过渡越平缓 |
| roundness | integer | 否 | `100` | 形状：100 = 圆形，0 = 匹配图像宽高比的椭圆 |
| centerX | integer | 否 | `50` | 水平中心位置，百分比（0-100） |
| centerY | integer | 否 | `50` | 垂直中心位置，百分比（0-100） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## 说明 {#notes}

- 较小的 `radius` 会使图像更多区域变暗；较大的半径会将暗角限制在最边缘处。
- 使用非黑色的 `color`（例如白色或棕褐色调）可实现有创意的暗角效果。
- 调整 `centerX` 和 `centerY` 可让清晰区域偏离中心，适用于将焦点引向不在画面中央的主体。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
