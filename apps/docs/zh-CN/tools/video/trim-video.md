---
description: "通过指定起止时间从视频中剪出片段。"
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: e845514289a2
---

# Trim Video {#trim-video}

通过以秒为单位指定起止时间，从视频中剪出片段，并可选择帧精确剪辑。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 起始时间，单位为秒（必须 >= 0） |
| endS | number | Yes | - | 结束时间，单位为秒（必须晚于 startS） |
| precise | boolean | No | `false` | 重新编码以实现帧精确剪辑，而非关键帧定位 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- 当 `precise` 为 `false`（默认）时，工具使用关键帧定位，速度快，但可能在所请求时间之前几帧开始。
- 将 `precise` 设置为 `true` 会重新编码该片段以获得精确的帧边界，但耗时更长。
- `endS` 值必须大于 `startS`。
