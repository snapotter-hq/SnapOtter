---
description: "アニメーション GIF を MP4、WebM、または MOV 動画に変換します。"
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 0e7c6b047506
---

# GIF to Video {#gif-to-video}

アニメーション GIF をコンパクトな MP4、WebM、または MOV 動画ファイルに変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

GIF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 出力フォーマット: `mp4`、`webm`、`mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- GIF から動画への変換は、同じ視覚品質を保ちながら通常はファイルサイズを 80〜90% 削減します。
- 受け付けるのはアニメーション GIF ファイルのみです。静止画像には画像の Convert ツールを使用してください。
- MP4 と MOV は H.264 エンコードを、WebM は VP9 を使用します。
