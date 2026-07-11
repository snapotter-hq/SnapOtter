---
description: "動画から音声トラックを抽出します。"
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 9983a995ec76
---

# Extract Audio {#extract-audio}

動画ファイルから音声トラックを抽出し、MP3、WAV、M4A、または OGG として保存します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 出力音声フォーマット: `mp3`、`wav`、`m4a`、`ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- 動画に音声トラックがない場合、リクエストは 400 エラーを返します。
- MP3 は非可逆ですが幅広く互換性があります。WAV は可逆ですがサイズが大きくなります。M4A（AAC）は品質とサイズのバランスが良好です。OGG はオープンコーデックのワークフロー向けに利用できます。
- ソース音声がすでに AAC で出力フォーマットが M4A の場合、音声ストリームは再エンコードせずにコピーされます。
