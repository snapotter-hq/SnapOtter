---
description: "速度を変えずに音声のピッチをセミトーン単位で上げ下げします。"
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 99cee53788cd
---

# ピッチシフト {#pitch-shift}

再生速度を変えずに、音声ファイルのピッチをセミトーン単位で上げ下げします。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | シフトするセミトーン数（-12〜12）。0 以外である必要があります。 |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- 正の値はピッチを上げ、負の値はピッチを下げます。
- 12 セミトーンのシフトは 1 オクターブ上、-12 は 1 オクターブ下に相当します。
- シフト量に関係なく再生時間は変わりません。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、サポートされていないデコード専用の入力は MP3 にフォールバックします。
