---
description: "固定のゲイン（デシベル）で音声の音量を上げ下げします。"
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: 6d3dabd3cb22
---

# Volume Adjust {#volume-adjust}

固定のゲイン（デシベル）を適用して、音声ファイルの音量を上げ下げします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

音声ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | 音量の調整量（デシベル、-30 から 30） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- 正の値は音量を上げ、負の値は下げます。
- 大きな正のゲインはクリッピングを引き起こすことがあります。ラウドネスを損なわないレベル調整には normalize-audio を使用してください。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、デコード専用でサポートされない入力は MP3 にフォールバックします。
