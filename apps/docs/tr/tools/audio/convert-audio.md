---
description: "Sesi MP3, WAV, OGG, FLAC ve M4A formatları arasında dönüştürün."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 90b93fea4b4c
---

# Convert Audio {#convert-audio}

Ses dosyalarını MP3, WAV, OGG, FLAC ve M4A dahil yaygın formatlar arasında, yapılandırılabilir çıktı bit hızıyla dönüştürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| format | string | Hayır | `"mp3"` | Çıktı formatı: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Hayır | `192` | kbps cinsinden çıktı bit hızı (32 ile 320 arası) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Notlar {#notes}

- Desteklenen girdi formatları arasında MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF ve OPUS bulunur.
- Bit hızı yalnızca kayıplı formatlar (MP3, OGG, M4A) için geçerlidir. WAV ve FLAC gibi kayıpsız formatlar bu ayarı yok sayar.
- Çıktı dosya adı, orijinal adı yeni uzantıyla korur.
