---
description: "一連の画像をスライドショー動画に変換します。"
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: c5a3597dcd66
---

# Images to Video {#images-to-video}

一連の画像を、画像ごとの表示時間、解像度、フレームレートを設定できるスライドショー動画に変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

2つ以上の画像ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | 画像ごとの表示時間（秒単位、0.5-10） |
| resolution | string | No | `"720p"` | 出力解像度: `1080p`、`720p`、`square` |
| fps | integer | No | `30` | 出力フレームレート（10-60） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- 1リクエストあたり 2〜60 個の画像ファイルを受け付けます。画像はアップロード順に動画へ表示されます。
- 画像はアスペクト比を保ちながら、目標解像度に合わせてリサイズおよびパディングされます。
- `square` 解像度オプションは 1080x1080 の動画を生成し、ソーシャルメディアに便利です。
- 出力フォーマットは常に MP4（H.264）です。
