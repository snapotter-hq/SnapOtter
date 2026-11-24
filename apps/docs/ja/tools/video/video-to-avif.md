---
description: "動画クリップをアニメーション AVIF 画像に変換します。"
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 7170fd5bc75c
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

動画クリップを、フレームレート、幅、品質、クリップ範囲を設定できるアニメーション AVIF 画像に変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 出力フレームレート（1-30） |
| width | integer | No | `480` | 出力の幅（ピクセル単位、64-1280）。高さは比例してスケーリングされます |
| startS | number | No | `0` | クリップの開始位置（秒単位） |
| durationS | number | No | `5` | クリップの長さ（秒単位、最大 60） |
| quality | integer | No | `50` | AVIF の品質（1-100） |
| loop | boolean | No | `true` | アニメーションをループします |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1 のエンコードは GIF や WebP より時間がかかるため、このツールは通常 `202` とジョブを返し、その進捗は SSE で `/api/v1/jobs/{jobId}/progress` から追跡します。短いクリップは同期待機時間内に完了し、結果を直接返すことがあります：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- アニメーション AVIF はロイヤリティフリーで、同じ画質ならアニメーション WebP や GIF より通常小さくなります。
- 現行のブラウザはアニメーション AVIF を再生できます。デスクトップの画像ビューアの中には最初のフレームしか表示しないものもあります。
- 音声トラックは削除されます。
