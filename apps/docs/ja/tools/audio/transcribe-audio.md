---
description: "AI を活用した文字起こしで音声をテキストに変換します。"
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: b75787b6745a
---

# Transcribe Audio {#transcribe-audio}

AI を活用した文字起こし（faster-whisper）で音声をテキストに変換します。プレーンテキスト、SRT、VTT の出力形式に対応し、言語の自動または手動選択が可能です。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

音声ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | 言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| outputFormat | string | No | `"txt"` | 出力形式: `txt`、`srt`、`vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

これは非同期ツールです。API はただちに `202 Accepted` を返します:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`GET /api/v1/jobs/{jobId}/progress` の SSE で進捗を追跡します。ジョブが完了すると、SSE ストリームが `downloadUrl` とともに最終結果を配信します。

## Notes {#notes}

- **transcription** 機能バンドルのインストールが必要です。バンドルが利用できない場合、コード `FEATURE_NOT_INSTALLED`、不足している `feature`、`featureName`、`estimatedSize` とともに `501` を返します。
- 文字起こしには faster-whisper を使用します。言語 `auto` は、話されている言語を自動検出します。
- `srt` と `vtt` 形式は各セグメントのタイムスタンプを含み、字幕に適しています。
- `txt` 形式はタイムスタンプなしのプレーンテキストを返します。
- これは実行時間の長い AI ツールです。処理時間は音声の長さとサーバーのハードウェアに依存します。
