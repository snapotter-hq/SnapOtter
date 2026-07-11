---
description: "Yapay zeka destekli transkripsiyon ile konuşmayı metne dönüştürün."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: ff100c40114a
---

# Transcribe Audio {#transcribe-audio}

Yapay zeka destekli transkripsiyon (faster-whisper) kullanarak konuşmayı metne dönüştürün. Otomatik veya manuel dil seçimiyle düz metin, SRT ve VTT çıktı formatlarını destekler.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Bir ses dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Dil: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Çıktı formatı: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Bu asenkron bir araçtır. API hemen `202 Accepted` döndürür:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

İlerlemeyi `GET /api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden izleyin. İş tamamlandığında, SSE akışı nihai sonucu bir `downloadUrl` ile birlikte teslim eder.

## Notes {#notes}

- **transcription** özellik paketinin kurulu olmasını gerektirir. Paket kullanılabilir değilse `FEATURE_NOT_INSTALLED` koduyla `501`, eksik `feature`, `featureName` ve `estimatedSize` döndürür.
- Transkripsiyon için faster-whisper kullanır. `auto` dili konuşulan dili otomatik olarak algılar.
- `srt` ve `vtt` formatları her segment için zaman damgaları içerir ve altyazılar için uygundur.
- `txt` formatı zaman damgası olmadan düz metin döndürür.
- Bu uzun süren bir yapay zeka aracıdır; işleme süresi ses uzunluğuna ve sunucu donanımına bağlıdır.
