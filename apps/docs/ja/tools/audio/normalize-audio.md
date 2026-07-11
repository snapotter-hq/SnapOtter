---
description: "放送標準レベル（EBU R128）にラウドネスを均一化します。"
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: cd34720ac25b
---

# 音声を正規化 {#normalize-audio}

EBU R128 正規化（-16 LUFS）を使用して、音声のラウドネスを放送標準レベルに均一化します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

このツールに設定可能なパラメータはありません。EBU R128 ラウドネス正規化を自動的に適用します。

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- EBU R128 ラウドネス標準を使用し、-16 LUFS を目標とします。
- ラウドネスの一貫性が重要なポッドキャスト、オーディオブック、放送コンテンツに最適です。
- ソースのサンプルレートは出力で保持されます。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、サポートされていないデコード専用の入力は MP3 にフォールバックします。
