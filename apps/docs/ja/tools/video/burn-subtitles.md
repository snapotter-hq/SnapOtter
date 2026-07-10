---
description: "字幕を動画のフレームに恒久的に焼き込みます。"
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 98591ed91dd9
---

# Burn Subtitles {#burn-subtitles}

SRT、VTT、または ASS ファイルの字幕を、動画のすべてのフレームに恒久的にレンダリング（ハードコード）します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

動画ファイルと字幕ファイルを含む multipart フォームデータを受け付けます。これは非同期エンドポイントで、即座に `202 Accepted` を返し、進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE でストリーミングされます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | 字幕のフォントサイズ（ピクセル単位、8-72） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- ファイルを2つアップロードします。1つ目は動画、2つ目は字幕ファイル（.srt、.vtt、または .ass）である必要があります。
- 焼き込まれた字幕は動画の恒久的な一部となり、視聴者側でオフにすることはできません。切り替え可能な字幕には、代わりに Embed Subtitles ツールを使用してください。
- ジョブが完了するまで、進捗の更新は `GET /api/v1/jobs/{jobId}/progress` の SSE で確認できます。
