---
description: "Bir ses dosyasından sessiz bölümleri çıkarın."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: dbad2fe62e7b
---

# Silence Removal {#silence-removal}

Yapılandırılabilir bir eşik ve minimum süreye göre bir ses dosyasındaki sessiz bölümleri algılayın ve kaldırın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Bir ses dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | dB cinsinden sessizlik eşiği (-80 ile -20 arası). Bu seviyenin altındaki ses sessiz kabul edilir. |
| minSilenceS | number | No | `0.5` | Kaldırılacak saniye cinsinden minimum sessizlik süresi (0.1 ile 5 arası) |

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

- Daha yüksek (daha az negatif) bir eşik daha agresiftir ve gerçek sessizliğin yanı sıra daha sessiz pasajları da kaldırır.
- Yalnızca daha uzun duraklamaları çıkarmak, kısa doğal boşlukları korumak için `minSilenceS` değerini artırın.
- Podcast kayıtlarını, dersleri ve sesli notları temizlemek için kullanışlıdır.
- Çıktı genellikle giriş konteynerini korur. AAC girişi M4A olarak yazılır ve desteklenmeyen yalnızca-çözme girişleri MP3'e geri döner.
