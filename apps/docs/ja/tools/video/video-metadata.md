---
description: "動画からメタデータを取り除き、見つかった内容を報告します。"
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 73c5c75470f2
---

# Clean Video Metadata {#clean-video-metadata}

動画からメタデータ（作成日、GPS 座標、カメラモデル、ソフトウェアタグなど）を取り除き、削除された内容を報告します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

動画ファイルを含む multipart フォームデータを受け付けます。このツールに設定可能な項目はありません。

## Parameters {#parameters}

このツールにパラメータはありません。動画コンテナからすべてのメタデータを取り除きます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- 取り除かれるメタデータには、作成タイムスタンプ、GPS/位置情報、カメラ/デバイス情報、ソフトウェアタグが含まれます。
- 映像と音声のストリームは再エンコードせずにコピーされるため、品質の低下はありません。
- 動画を公開する前のプライバシー保護に役立ちます。
