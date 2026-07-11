---
description: "任意の音声ファイルから着信音クリップを作成します。"
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: b3159e74efe2
---

# 着信音メーカー {#ringtone-maker}

開始時間と長さを選択して、任意の音声ファイルから着信音クリップ（.m4r）を作成します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 開始時間（秒、最小 0） |
| durationS | number | No | `30` | クリップの長さ（秒、1〜30） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## 注意事項 {#notes}

- 出力は常に M4R 形式で、iPhone の着信音と互換性があります。
- 着信音の最大の長さは 30 秒です（Apple の制限）。
- 任意の音声形式を入力として使用できます。
