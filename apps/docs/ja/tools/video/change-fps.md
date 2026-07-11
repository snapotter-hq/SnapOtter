---
description: "動画のフレームレートを変更します。"
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 38862d201bc1
---

# Change FPS {#change-fps}

動画のフレームレートを 1 から 120 fps の間の目標値に変更します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | 目標フレームレート（1-120） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- フレームレートを下げるとフレームが間引かれ、ファイルサイズが小さくなります。上げるとフレームが複製されてギャップを埋めますが、実際の動きの詳細が追加されるわけではありません。
- 一般的な目標値: 24（映画）、30（ウェブ/放送）、60（滑らかな再生）。
- 音声トラックは元のサンプルレートで保持されます。
