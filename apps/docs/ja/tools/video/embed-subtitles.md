---
description: "字幕トラックを動画コンテナに多重化します。"
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 4e80ed3f3add
---

# Embed Subtitles {#embed-subtitles}

字幕ファイルを、視聴者がオン/オフを切り替えられるソフト字幕トラックとして動画コンテナに多重化します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

動画ファイルと字幕ファイル、および JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B 言語コード（小文字3文字、例: `"eng"`、`"fra"`、`"deu"`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- ファイルを2つアップロードします。1つ目は動画、2つ目は字幕ファイル（.srt、.vtt、または .ass）である必要があります。
- 埋め込まれた（ソフト）字幕は、視聴者がメディアプレーヤーで切り替えられます。常時表示される字幕には、代わりに Burn Subtitles ツールを使用してください。
- 言語コードはコンテナ内にメタデータとして保存され、メディアプレーヤーが字幕トラックにラベルを付けるのに役立ちます。
