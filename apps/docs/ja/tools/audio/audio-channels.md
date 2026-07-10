---
description: "モノラルとステレオを相互変換したり、左右のチャンネルを入れ替えたりします。"
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: f5d814fbc0e7
---

# 音声チャンネル {#audio-channels}

音声をモノラルとステレオのレイアウト間で変換したり、ステレオファイルの左右のチャンネルを入れ替えたりします。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Yes | - | チャンネル操作: `stereo-to-mono`、`mono-to-stereo`、`swap` |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## 注意事項 {#notes}

- `stereo-to-mono` は両方のチャンネルを 1 つのモノラルトラックにミックスします。
- `mono-to-stereo` はモノラルチャンネルを左右の両方に複製します。
- `swap` はステレオファイルの左右のチャンネルを入れ替えます。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、サポートされていないデコード専用の入力は MP3 にフォールバックします。
