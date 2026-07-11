---
description: "動画から音声トラックを削除します。"
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 24a44b0406da
---

# Mute Video {#mute-video}

動画から音声トラックを削除し、映像ストリームだけを残します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

動画ファイルを含む multipart フォームデータを受け付けます。このツールに設定可能な項目はありません。

## Parameters {#parameters}

このツールにパラメータはありません。アップロードされた動画から音声トラックを取り除きます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- 映像ストリームは再エンコードせずにコピーされるため、品質の低下はありません。
- 入力動画に音声トラックがない場合、ファイルはそのまま返されます。
