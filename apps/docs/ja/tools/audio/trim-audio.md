---
description: "開始時刻と終了時刻を指定して、音声ファイルの一部を切り出します。"
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 8d726f232cb7
---

# Trim Audio {#trim-audio}

開始時刻と終了時刻を秒で指定して、音声ファイルの一部を切り出します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

音声ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 開始時刻（秒、最小 0） |
| endS | number | Yes | - | 終了時刻（秒、開始時刻より後である必要があります） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- 時刻は秒で指定し、小数を含めることができます（例: `10.5`）。
- `endS` の値は `startS` より大きい必要があります。
- `endS` が音声の長さを超える場合、ファイルは末尾まで切り出されます。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、デコード専用でサポートされない入力は MP3 にフォールバックします。
