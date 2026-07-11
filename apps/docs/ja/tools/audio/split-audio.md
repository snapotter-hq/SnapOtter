---
description: "音声を時間間隔、等分、または無音検出で分割します。"
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 841d869c14d4
---

# Split Audio {#split-audio}

音声ファイルを固定の時間間隔、等分、または自動の無音検出でセグメントに分割します。セグメントの ZIP アーカイブを返します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

音声ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | 分割方法: `time`、`parts`、`silence` |
| segmentS | number | No | `60` | セグメントの長さ（秒、1 から 3600。mode が `time` のときに使用） |
| parts | integer | No | `2` | 等分する数（2 から 20。mode が `parts` のときに使用） |
| thresholdDb | number | No | `-40` | 無音のしきい値（dB、-80 から -20。mode が `silence` のときに使用） |
| minSilenceS | number | No | `0.3` | 無音の最小間隔（秒、0.1 から 10。mode が `silence` のときに使用） |

## Example Request {#example-request}

30 秒のセグメントに分割:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

無音検出で分割:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` は、すべてのセグメントを含む ZIP アーカイブを指します。
- 選択した `mode` に関連するパラメータのみが使用され、それ以外は無視されます。
- セグメントのファイル名は連番で付けられます（例: `part-000.mp3`、`part-001.mp3`）。
- 出力形式は入力形式に一致します。
