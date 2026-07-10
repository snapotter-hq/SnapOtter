---
description: "Mono ve stereo arasında dönüştürün veya sol ve sağ kanalları değiştirin."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 2c63d35c99a7
---

# Audio Channels {#audio-channels}

Sesi mono ve stereo düzenler arasında dönüştürün veya bir stereo dosyanın sol ve sağ kanallarını değiştirin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| mode | string | Evet | - | Kanal işlemi: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Notlar {#notes}

- `stereo-to-mono` her iki kanalı tek bir mono parçaya karıştırır.
- `mono-to-stereo` mono kanalı hem sola hem de sağa çoğaltır.
- `swap` bir stereo dosyanın sol ve sağ kanallarını takas eder.
- Çıktı genellikle girdi konteynerini korur. AAC girdisi M4A olarak yazılır ve desteklenmeyen yalnızca-çözümleme (decode-only) girdileri MP3'e geri döner.
