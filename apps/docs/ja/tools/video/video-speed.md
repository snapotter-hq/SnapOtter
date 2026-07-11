---
description: "動画を早送りまたはスロー再生します。"
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 7c7d0e810878
---

# Video Speed {#video-speed}

音声のピッチを保持するオプション付きで、動画を早送りまたはスロー再生します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | 速度の倍率（0.25-4）。1 を超える値で早送り、1 未満でスロー再生になります |
| keepPitch | boolean | No | `true` | 速度変更時に音声のピッチを保持します |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- 倍率 `2` は再生速度を2倍にします（再生時間が半分）。倍率 `0.5` は再生速度を半分にします（再生時間が2倍）。
- `keepPitch` が `true` の場合、音声はタイムストレッチされ、声が自然に聞こえます。`false` の場合、ピッチは速度に比例して変化します。
- 有効な範囲は 0.25 倍から 4 倍です。
