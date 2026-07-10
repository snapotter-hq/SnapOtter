---
description: "動画の音声トラックを別のファイルに差し替えます。"
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: b81d7d533585
---

# Replace Audio {#replace-audio}

動画の音声トラックを音声ファイルに差し替えます。動画と音声ファイルの両方をアップロードします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

ちょうど2つのファイルを含む multipart フォームデータを受け付けます。動画ファイルの後に音声ファイルを続けます。

## Parameters {#parameters}

このツールに設定パラメータはありません。動画ファイルと音声ファイルを2つの `file` パートとしてアップロードします。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- ちょうど2つのファイルをアップロードする必要があります。1つ目は動画、2つ目は音声ファイルである必要があります。
- 音声ファイルが動画より長い場合、動画の長さに合わせてトリミングされます。短い場合、残りの動画は無音で再生されます。
- 映像ストリームは再エンコードせずにコピーされるため、映像品質の低下はありません。
