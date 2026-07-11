---
description: "動画クリップを逆再生します。"
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: d5ef42697d20
---

# Reverse Video {#reverse-video}

動画クリップを逆再生します。音声トラックも反転されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

動画ファイルを含む multipart フォームデータを受け付けます。このツールに設定可能な項目はありません。

## Parameters {#parameters}

このツールにパラメータはありません。動画全体を反転します。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- 長さが最大 5 分までのクリップに制限されます。それより長い動画は 400 エラーで拒否されます。
- 映像と音声の両トラックが反転されます。音声なしで動画を反転するには、先にミュートしてください。
