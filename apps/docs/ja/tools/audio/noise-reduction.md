---
description: "FFT ベースのノイズ除去で音声の背景ノイズを低減します。"
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 4c44e1ec3502
---

# ノイズ低減 {#noise-reduction}

選択可能な強度で FFT ベースのノイズ除去を使用し、音声ファイルの背景ノイズを低減します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | ノイズ除去の強度: `light`、`medium`、`strong` |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` はより多くのディテールを保持しますが、除去するノイズは少なくなります。`strong` はより多くのノイズを除去しますが、わずかなアーティファクトが生じることがあります。
- ファンの音、エアコン、静電気ノイズなど、一定の背景ノイズがある録音で最良の結果が得られます。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、サポートされていないデコード専用の入力は MP3 にフォールバックします。
