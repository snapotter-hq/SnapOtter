---
description: "音声ファイルを逆再生されるように反転します。"
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 250b9e08d872
---

# 音声を反転 {#reverse-audio}

音声ファイルを逆再生されるように反転します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

このツールに設定可能なパラメータはありません。音声ファイル全体が反転されます。

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- 音声トラック全体が末尾から先頭へ反転されます。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、サポートされていないデコード専用の入力は MP3 にフォールバックします。
