---
description: "開始時刻と終了時刻を指定して動画からクリップを切り出します。"
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 14640a0c1434
---

# Trim Video {#trim-video}

開始時刻と終了時刻を秒単位で指定して動画からクリップを切り出します。フレーム単位で正確に切り出すオプションもあります。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 開始時刻（秒単位、0 以上である必要があります） |
| endS | number | Yes | - | 終了時刻（秒単位、startS より後である必要があります） |
| precise | boolean | No | `false` | キーフレームシークではなく、フレーム単位で正確に切り出すために再エンコードします |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- `precise` が `false`（デフォルト）の場合、ツールはキーフレームシークを使用します。これは高速ですが、要求した時刻より数フレーム前から始まる場合があります。
- `precise` を `true` に設定すると、正確なフレーム境界のためにセグメントを再エンコードしますが、時間が長くかかります。
- `endS` の値は `startS` より大きい必要があります。
