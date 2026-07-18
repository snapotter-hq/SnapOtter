---
description: "MP3、WAV、OGG、FLAC、M4A 形式の間で音声を変換します。"
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 76c462fa171c
---

# 音声を変換 {#convert-audio}

MP3、WAV、OGG、FLAC、M4A などの一般的な形式の間で音声ファイルを変換し、出力ビットレートとサンプルレートを設定できます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 出力形式: `mp3`、`wav`、`ogg`、`flac`、`m4a` |
| bitrateKbps | integer | No | `192` | 出力ビットレート（kbps、32〜320） |
| sampleRate | integer | No | 元のレート | 出力サンプルレート（Hz）: `8000`、`16000`、`22050`、`32000`、`44100`、`48000`、または `96000`。省略すると元のレートが維持されます |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## 注意事項 {#notes}

- サポートされる入力形式には MP3、WAV、OGG、FLAC、AAC、M4A、WMA、AIFF、OPUS が含まれます。
- ビットレートは非可逆形式（MP3、OGG、M4A）にのみ適用されます。WAV や FLAC などの可逆形式ではこの設定は無視されます。
- MP3 出力でサポートされるサンプルレートは最大 48000 Hz です。96000 Hz のオプションは WAV、OGG、FLAC、M4A にのみ適用されます。
- MP3 のビットレートはサンプルレートによって上限が設けられます。8000 Hz では最大 64 kbps、16000 Hz または 22050 Hz では最大 160 kbps です。上限を超えるリクエストは、暗黙的に引き下げられるのではなく拒否されます。
- 出力ファイル名は元の名前を保持し、新しい拡張子が付きます。
