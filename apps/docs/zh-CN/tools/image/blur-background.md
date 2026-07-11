---
description: "使用 AI 在保持主体清晰的同时模糊背景。"
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 9e168c490af4
---

# Blur Background {#blur-background}

在保持主体清晰的同时模糊图像背景。AI 模型会隔离主体，对原始背景应用模糊，然后将清晰的主体合成到上方。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

接受包含图像文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| intensity | integer | 否 | `50` | 模糊强度（1-100） |
| feather | integer | 否 | `0` | 边缘羽化半径（0-20） |
| format | string | 否 | `"png"` | 输出格式：`png` 或 `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
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
- 更高的强度值会产生更强的模糊效果。超过 80 的值会营造出明显的类似焦外虚化的分离感。
- HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
