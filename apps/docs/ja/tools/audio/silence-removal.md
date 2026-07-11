---
description: "音声ファイルから無音区間を取り除きます。"
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 1f44089600e6
---

# Silence Removal {#silence-removal}

設定可能なしきい値と最小継続時間に基づいて、音声ファイルから無音区間を検出して除去します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

音声ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | 無音のしきい値（dB、-80 から -20）。このレベルを下回る音声は無音とみなされます。 |
| minSilenceS | number | No | `0.5` | 除去する無音の最小継続時間（秒、0.1 から 5） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- しきい値が高い（負の値が小さい）ほど処理が積極的になり、本当の無音だけでなく、より静かな箇所も除去されます。
- `minSilenceS` を大きくすると、短い自然な間を残しつつ、より長いポーズだけを取り除けます。
- ポッドキャストの録音、講義、ボイスメモのクリーンアップに便利です。
- 出力は通常、入力コンテナを維持します。AAC 入力は M4A として書き出され、デコード専用でサポートされない入力は MP3 にフォールバックします。
