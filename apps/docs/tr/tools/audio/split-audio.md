---
description: "Sesi zaman aralıklarına, eşit parçalara veya sessizlik algılamaya göre bölün."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 587c89692229
---

# Split Audio {#split-audio}

Bir ses dosyasını sabit zaman aralıklarına, eşit parçalara veya otomatik sessizlik algılamaya göre segmentlere bölün. Segmentleri içeren bir ZIP arşivi döndürür.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Bir ses dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Bölme stratejisi: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Saniye cinsinden segment uzunluğu, 1 ile 3600 arası (mod `time` olduğunda kullanılır) |
| parts | integer | No | `2` | Eşit parça sayısı, 2 ile 20 arası (mod `parts` olduğunda kullanılır) |
| thresholdDb | number | No | `-40` | dB cinsinden sessizlik eşiği, -80 ile -20 arası (mod `silence` olduğunda kullanılır) |
| minSilenceS | number | No | `0.3` | Saniye cinsinden minimum sessizlik boşluğu, 0.1 ile 10 arası (mod `silence` olduğunda kullanılır) |

## Example Request {#example-request}

30 saniyelik segmentlere böl:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Sessizlik algılamaya göre böl:

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

- `downloadUrl` tüm segmentleri içeren bir ZIP arşivine işaret eder.
- Yalnızca seçilen `mode` ile ilgili parametreler kullanılır; diğerleri yok sayılır.
- Segment dosya adları sıralı olarak numaralandırılır (ör. `part-000.mp3`, `part-001.mp3`).
- Çıktı formatı giriş formatıyla eşleşir.
