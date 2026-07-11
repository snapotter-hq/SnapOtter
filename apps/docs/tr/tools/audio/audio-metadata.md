---
description: "Ses meta veri etiketlerini (ID3) görüntüleyin, düzenleyin veya kaldırın."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 4cef403fe66b
---

# Audio Metadata {#audio-metadata}

Başlık, sanatçı ve albüm gibi ses meta veri etiketlerini (ID3 ve benzeri etiket formatları) görüntüleyin, düzenleyin veya kaldırın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| strip | boolean | Hayır | `false` | Mevcut tüm meta veri etiketlerini kaldır |
| title | string | Hayır | - | Başlık etiketini ayarla (en fazla 500 karakter) |
| artist | string | Hayır | - | Sanatçı etiketini ayarla (en fazla 500 karakter) |
| album | string | Hayır | - | Albüm etiketini ayarla (en fazla 500 karakter) |

## Örnek İstek {#example-request}

Meta veri etiketlerini düzenle:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Tüm meta veriyi kaldır:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Notlar {#notes}

- Yanıt, konteyner formatı, süre, bit hızı ve mevcut etiketleri içeren bir `metadata` nesnesi içerir.
- `strip` değeri `true` olduğunda, tüm etiket alanları yok sayılır ve mevcut her etiket kaldırılır.
- Yalnızca sağladığınız etiketler güncellenir; belirtilmeyen etiketler değişmeden kalır.
- Çıktı formatı girdi formatıyla eşleşir.
