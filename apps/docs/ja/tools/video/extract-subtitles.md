---
description: "動画から字幕トラックを SRT、WebVTT、ASS のいずれかのファイルとして取り出します。"
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 9a7c6d3c2330
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

動画コンテナから埋め込まれた字幕トラックを抽出し、SRT、WebVTT、ASS のいずれかのファイルとしてダウンロードします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

動画ファイルと任意の `settings` JSON 文字列を含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | 出力フォーマット: `srt`、`vtt`（WebVTT）、`ass` |

動画コンテナ内で見つかった最初の字幕トラックを抽出します。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 動画には埋め込み字幕トラックが含まれている必要があります。字幕トラックが見つからない場合、リクエストは 400 エラーを返します。
- 動画に複数の字幕トラックがある場合、最初の1つが抽出されます。
- テキスト字幕トラック（SubRip、ASS、mov_text、WebVTT）は 3 つの出力フォーマットのどれにでも変換できます。ASS トラックを SRT や WebVTT に変換すると、位置指定とエフェクトは失われます。
- 画像ベースの字幕トラック（Blu-ray PGS、DVD VobSub）は OCR なしではテキストに変換できないため、422 エラーを返します。
