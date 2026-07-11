---
description: "Herhangi bir ses dosyasından bir zil sesi klibi oluşturun."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: d45c381ebf34
---

# Ringtone Maker {#ringtone-maker}

Bir başlangıç zamanı ve süre seçerek herhangi bir ses dosyasından bir zil sesi klibi (.m4r) oluşturun.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| startS | number | Hayır | `0` | Saniye cinsinden başlangıç zamanı (en az 0) |
| durationS | number | Hayır | `30` | Saniye cinsinden klip süresi (1 ile 30 arası) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Notlar {#notes}

- Çıktı her zaman M4R formatındadır ve iPhone zil sesleriyle uyumludur.
- Maksimum zil sesi süresi 30 saniyedir (Apple sınırı).
- Girdi olarak herhangi bir ses formatı kullanılabilir.
