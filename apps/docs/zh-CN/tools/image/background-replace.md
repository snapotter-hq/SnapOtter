---
description: "使用 AI 将图像背景替换为纯色或渐变。"
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: cab14964451d
---

# Background Replace {#background-replace}

将图像背景替换为纯色或渐变。AI 模型会检测主体、移除原始背景，并将主体合成到你选择的背景上。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

接受包含图像文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | 否 | `"color"` | 背景模式：`color` 或 `gradient` |
| color | string | 否 | `"#ffffff"` | 背景十六进制颜色（当 backgroundType 为 `color` 时） |
| gradientColor1 | string | 否 | - | 第一个渐变十六进制颜色 |
| gradientColor2 | string | 否 | - | 第二个渐变十六进制颜色 |
| gradientAngle | integer | 否 | `180` | 渐变角度（度，0-360） |
| feather | integer | 否 | `0` | 边缘羽化半径（0-20） |
| format | string | 否 | `"png"` | 输出格式：`png` 或 `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

通过 `GET /api/v1/jobs/{jobId}/progress` 处的 SSE 跟踪进度。任务完成后，SSE 流会发出一个带下载 URL 的 `completed` 事件。

## Notes {#notes}

- 这是一个 AI 驱动的工具，返回 `202 Accepted` 并异步处理。连接到 SSE 端点以接收进度更新和最终结果。
- 需要安装 **background-removal** 功能包。如果该包不可用，则返回 `501`。
- HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
- 输出默认为 PNG，以保留主体周围的透明度。
