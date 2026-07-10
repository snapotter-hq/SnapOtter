---
description: "AI を使って動画の音声トラックから字幕ファイルを生成します。"
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: adbdc14ddb8a
---

# Auto Subtitles {#auto-subtitles}

AI 搭載の音声認識（faster-whisper）を使って、動画の音声トラックから字幕ファイルを生成します。自動検出と 10 の明示的な言語に対応しています。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。これは非同期エンドポイントで、すぐに `202 Accepted` を返し、進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE でストリーミングされます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | 音声の言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| format | string | No | `"srt"` | 出力する字幕形式: `srt`、`vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- これは **transcription** 機能バンドルのインストールが必要な AI ツールです。バンドルがインストールされていない場合、API は管理 UI 経由でインストールする手順とともに `501 Feature Not Installed` を返します。
- `auto` の言語オプションは whisper の組み込み言語検出を使用します。言語を明示的に指定すると精度と速度が向上します。
- SRT は最も広くサポートされている字幕形式です。VTT（WebVTT）は Web の動画プレーヤー向けの標準です。
- ジョブが完了するまで、進捗の更新は `GET /api/v1/jobs/{jobId}/progress` の SSE で確認できます。
