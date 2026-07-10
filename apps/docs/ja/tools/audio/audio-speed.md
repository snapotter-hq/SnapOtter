---
description: "倍率を指定して音声の再生速度を上げたり下げたりします。"
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: fec1f5513985
---

# 音声速度 {#audio-speed}

速度倍率を適用して音声の再生速度を上げたり下げたりします。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | 速度倍率（0.25〜4）。1 未満で減速、1 を超えると加速します。 |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## 注意事項 {#notes}

- `0.25` の倍率は 1/4 の速度で再生します（4 倍の長さ）。`4` の倍率は 4 倍の速度で再生します（1/4 の長さ）。
- 速度が変化してもピッチは保持されます（タイムストレッチ）。ピッチを独立して調整するにはピッチシフトを使用してください。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、サポートされていないデコード専用の入力は MP3 にフォールバックします。
