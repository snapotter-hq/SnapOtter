---
description: "動画から字幕トラックを SRT ファイルとして抽出します。"
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: e294ca50de11
---

# Extract Subtitles {#extract-subtitles}

動画コンテナから埋め込まれた字幕トラックを抽出し、SRT ファイルとしてダウンロードします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

動画ファイルを含む multipart フォームデータを受け付けます。このツールに設定可能な項目はありません。

## Parameters {#parameters}

このツールにパラメータはありません。動画コンテナ内で見つかった最初の字幕トラックを抽出します。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 動画には埋め込み字幕トラックが含まれている必要があります。字幕トラックが見つからない場合、リクエストは 400 エラーを返します。
- 動画に複数の字幕トラックがある場合、最初の1つが抽出されます。
- コンテナ内の元の字幕フォーマットにかかわらず、出力フォーマットは SRT です。
