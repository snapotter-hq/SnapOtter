---
description: "一連の画像を、スライドショー動画、アニメーション GIF、またはアニメーション WebP に変換します。"
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 291285e336bf
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

一連の画像を、画像ごとの表示時間、解像度、フレームレートを設定できるスライドショー動画に変換します。フレームごとの時間とループ回数を指定して、アニメーション GIF や WebP に変換することもできます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

2つ以上の画像ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | 出力形式: `mp4`、`gif`、`webp` |
| secondsPerImage | number | No | `2` | MP4 のみ。画像ごとの表示時間（秒単位、0.5-10） |
| resolution | string | No | `"720p"` | MP4 のみ。出力解像度: `1080p`、`720p`、`square` |
| fps | integer | No | `30` | MP4 のみ。出力フレームレート（10-60） |
| frameDelayMs | integer | No | `500` | GIF と WebP のみ。各画像を表示する時間（ミリ秒、20-10000） |
| loop | integer | No | `0` | GIF と WebP のみ。アニメーションの再生回数。`0` で無限ループ（0-100） |

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

各画像を 200 ms ずつ表示するアニメーション GIF を作成する例:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- MP4 では、画像はアスペクト比を保ちながら、目標解像度に合わせてリサイズおよびパディングされます。
- `square` 解像度オプションは 1080x1080 の動画を生成し、ソーシャルメディアに便利です。
- MP4 出力は H.264 で、ファイル名は `slideshow.mp4` になります。
- GIF と WebP の出力は、最初の画像のサイズを使用します。他のサイズの画像はその中に収まるように拡大縮小され、余った領域は透明になります。ファイル名は `slideshow.gif` または `slideshow.webp` です。
- GIF はフレーム時間を 100 分の 1 秒単位で保存するため、GIF では `frameDelayMs` が最も近い 10 ms に丸められます。WebP は正確な値を保持します。
- 大きなアニメーションは、生成されずに拒否されます。フレームサイズ × 画像数が、GIF ツールと同じピクセル上限を下回っている必要があります。
