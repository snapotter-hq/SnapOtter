---
description: "通过指定起止时间从视频中剪出片段。"
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 3ae6322e8376
i18n_hash_version: 2
---

# Trim Video {#trim-video}

从视频中剪出片段。可以保留起止时间之间的部分，也可以从开头和结尾各裁掉固定时长。还提供帧精确剪辑选项。

在应用中，时间字段可以直接填秒数（`90`），也可以填 `MM:SS`（`1:30`）或 `HH:MM:SS`（`1:02:03.5`）。API 只接受秒数。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` 保留 `startS` 到 `endS` 之间的部分。`ends` 从开头去掉 `cutStartS`，从结尾去掉 `cutEndS` |
| startS | number | No | `0` | 范围模式：起始时间，单位为秒（必须 >= 0） |
| endS | number | Range mode | - | 范围模式：结束时间，单位为秒（必须晚于 startS） |
| cutStartS | number | No | `0` | 两端模式：从开头去掉的秒数 |
| cutEndS | number | No | `0` | 两端模式：从结尾去掉的秒数 |
| precise | boolean | No | `false` | 重新编码整个范围，使起止帧都精确，而不是从下一个关键帧开始复制 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

无论视频多长，都去掉前 5 秒和最后 10 秒：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
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

- 当 `precise` 为 `false`（默认）时，片段从你指定的那一帧精确开始。只有该起点到下一个关键帧之间的帧会被重新编码，其余部分直接复制，因此速度仍然很快。结尾可能会多出一帧左右，因为复制的流会保留其前面帧所依赖的帧。无法安全拼接的源（10 位或隔行扫描的 H.264、起点需要重新编码的其他编码器，以及 AVI、FLV、MPEG 和 TS 文件）会改为整体重新编码。
- 将 `precise` 设置为 `true` 会始终重新编码整个范围，因此两端都精确，但耗时更长。
- 在范围模式下，`endS` 必须大于 `startS`。如果 `endS` 超出视频末尾，片段会播放到结尾。
- 在两端模式下，`cutStartS` 和 `cutEndS` 中至少有一个必须大于零，且两者合计必须留下一部分视频。由于裁剪量是按每个文件自身的时长计算的，同一个设置可用于一批时长不同的视频。
