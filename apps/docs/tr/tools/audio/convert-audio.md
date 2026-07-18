---
description: "Sesi MP3, WAV, OGG, FLAC ve M4A formatları arasında dönüştürün."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 90b93fea4b4c
---

# Convert Audio {#convert-audio}

Ses dosyalarını MP3, WAV, OGG, FLAC ve M4A dahil yaygın formatlar arasında, yapılandırılabilir çıktı bit hızı ve örnekleme hızıyla dönüştürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| format | string | Hayır | `"mp3"` | Çıktı formatı: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Hayır | `192` | kbps cinsinden çıktı bit hızı (32 ile 320 arası) |
| sampleRate | integer | Hayır | kaynak hızı | Hz cinsinden çıktı örnekleme hızı: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` veya `96000`. Kaynak hızını korumak için atlayın |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Notlar {#notes}

- Desteklenen girdi formatları arasında MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF ve OPUS bulunur.
- Bit hızı yalnızca kayıplı formatlar (MP3, OGG, M4A) için geçerlidir. WAV ve FLAC gibi kayıpsız formatlar bu ayarı yok sayar.
- MP3 çıktısı 48000 Hz'e kadar örnekleme hızlarını destekler. 96000 Hz seçeneği yalnızca WAV, OGG, FLAC ve M4A için geçerlidir.
- MP3 bit hızı örnekleme hızına göre sınırlıdır: 8000 Hz'de en fazla 64 kbps, 16000 veya 22050 Hz'de ise en fazla 160 kbps. Sınırın üzerindeki istekler sessizce düşürülmek yerine reddedilir.
- Çıktı dosya adı, orijinal adı yeni uzantıyla korur.
