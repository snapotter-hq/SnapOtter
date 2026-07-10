---
description: "動画からフレームを画像の ZIP として抽出します。"
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 4e4146e412ef
---

# Video to Frames {#video-to-frames}

動画から個々のフレームを抽出し、PNG または JPG 画像の ZIP アーカイブとしてダウンロードします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | 抽出モード: `all`、`nth`、`timestamps` |
| n | integer | No | `10` | N フレームごとに抽出します（2-1000）。mode が `"nth"` の場合にのみ使用されます |
| timestamps | string | No | `""` | カンマ区切りのタイムスタンプ（秒単位）。mode が `"timestamps"` の場合に必須です |
| format | string | No | `"png"` | 抽出するフレームの画像フォーマット: `png`、`jpg` |

## Example Request {#example-request}

30 フレームごとに JPG として抽出:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

特定のタイムスタンプでフレームを抽出:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- `all` モードはすべてのフレームを抽出し、長い動画では非常に大きな ZIP ファイルを生成する場合があります。選択的な抽出には `nth` または `timestamps` モードを使用してください。
- PNG は完全な品質を保ちますが、ファイルは大きくなります。JPG は小さくなりますが非可逆です。
- レスポンスは、連番が振られた画像ファイルを含む ZIP アーカイブとしてダウンロードされます。
