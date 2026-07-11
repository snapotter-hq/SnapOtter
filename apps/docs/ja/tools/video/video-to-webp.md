---
description: "動画クリップをアニメーション WebP 画像に変換します。"
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 456da871ddd6
---

# Video to WebP {#video-to-webp}

動画クリップを、フレームレート、幅、品質を設定できるアニメーション WebP 画像に変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 出力フレームレート（1-30） |
| width | integer | No | `480` | 出力の幅（ピクセル単位、16-1920）。高さは比例してスケーリングされます |
| quality | integer | No | `75` | WebP 圧縮品質（1-100） |
| loop | boolean | No | `true` | アニメーションをループします |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- アニメーション WebP は、より優れた色サポート（24 ビット対 8 ビットパレット）で GIF より小さいファイルを生成します。
- `quality` の値を低くすると、視覚的な忠実度を犠牲にファイルが小さくなります。
- 一度だけ再生して停止するアニメーションには、`loop` を `false` に設定してください。
