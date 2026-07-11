---
description: "音声にフェードインとフェードアウトの効果を加えます。"
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: a506e108365e
---

# 音声をフェード {#fade-audio}

音声ファイルの先頭と末尾にフェードインとフェードアウトの効果を加えます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | フェードインの長さ（秒、0〜30） |
| fadeOutS | number | No | `1` | フェードアウトの長さ（秒、0〜30） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## 注意事項 {#notes}

- そのフェード方向をスキップするには、いずれかの値を `0` に設定します。少なくとも一方は 0 より大きくする必要があります。
- フェードの長さが音声の長さを超える場合は、音声の長さに切り詰められます。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、サポートされていないデコード専用の入力は MP3 にフォールバックします。
