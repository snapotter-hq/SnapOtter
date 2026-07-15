---
description: "動画の音声音量を放送規格に正規化します。"
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: 38db801bdebb
---

# 動画音声ノーマライズ {#normalize-audio}

動画の音声音量を EBU R128 放送ラウドネス規格に正規化します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

動画ファイルを含む multipart フォームデータを受け付けます。このツールに設定可能な項目はありません。

## Parameters {#parameters}

このツールにパラメータはありません。音声トラックに EBU R128 ラウドネス正規化を適用します。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- FFmpeg の `loudnorm` フィルターを使用し、-16 LUFS の統合ラウドネス、-1.5 dBTP のトゥルーピーク、11 LU のラウドネスレンジ（EBU R128 放送規格）を目標とします。
- ソース音声のサンプルレートは出力で保持されます。
- 動画に音声トラックがない場合、リクエストは 400 エラーを返します。
