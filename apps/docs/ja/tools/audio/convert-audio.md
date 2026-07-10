---
description: "MP3、WAV、OGG、FLAC、M4A 形式の間で音声を変換します。"
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 76c462fa171c
---

# 音声を変換 {#convert-audio}

MP3、WAV、OGG、FLAC、M4A などの一般的な形式の間で音声ファイルを変換し、出力ビットレートを設定できます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 出力形式: `mp3`、`wav`、`ogg`、`flac`、`m4a` |
| bitrateKbps | integer | No | `192` | 出力ビットレート（kbps、32〜320） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## 注意事項 {#notes}

- サポートされる入力形式には MP3、WAV、OGG、FLAC、AAC、M4A、WMA、AIFF、OPUS が含まれます。
- ビットレートは非可逆形式（MP3、OGG、M4A）にのみ適用されます。WAV や FLAC などの可逆形式ではこの設定は無視されます。
- 出力ファイル名は元の名前を保持し、新しい拡張子が付きます。
