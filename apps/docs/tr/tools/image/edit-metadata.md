---
description: "Görüntülerde EXIF, IPTC, GPS ve XMP meta veri alanlarını piksel yeniden kodlaması olmadan düzenleyin."
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: 1ba065328abd
---

# Meta Veri Düzenle {#edit-metadata}

EXIF, IPTC, GPS koordinatları, tarihler ve anahtar kelimeler dahil olmak üzere görüntü meta veri alanlarını düzenleyin. Arka planda ExifTool kullanır, bu nedenle meta veriler pikselleri yeniden kodlamadan yerinde yazılır ve tam görüntü kalitesi korunur.

## API Uç Noktaları {#api-endpoints}

### Meta Veri Düzenle {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Meta veri alanlarını görüntüye yazar ve değiştirilen dosyayı döndürür.

### Meta Veriyi İncele {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Görüntüden tam meta veriyi ExifTool aracılığıyla JSON olarak döndürür. Görüntüyü değiştirmez.

## Parametreler (Düzenle) {#parameters-edit}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| title | string | Hayır | - | Görüntü başlığı (XMP/EXIF) |
| author | string | Hayır | - | Yazar adı |
| artist | string | Hayır | - | Sanatçı adı (EXIF Artist etiketi) |
| copyright | string | Hayır | - | Telif hakkı bildirimi |
| imageDescription | string | Hayır | - | Görüntü açıklaması (EXIF) |
| software | string | Hayır | - | Yazılım etiketi |
| dateTime | string | Hayır | - | EXIF DateTime değeri |
| dateTimeOriginal | string | Hayır | - | EXIF DateTimeOriginal değeri |
| setAllDates | string | Hayır | - | Tüm tarih alanlarını bir kerede ayarla |
| dateShift | string | Hayır | - | Tüm tarihleri ofset kadar kaydır (biçim: `+HH:MM` veya `-HH:MM`) |
| clearGps | boolean | Hayır | `false` | Tüm GPS verilerini kaldır |
| gpsLatitude | number | Hayır | - | GPS enlemini ayarla (-90 ile 90 arası) |
| gpsLongitude | number | Hayır | - | GPS boylamını ayarla (-180 ile 180 arası) |
| gpsAltitude | number | Hayır | - | GPS yüksekliğini metre cinsinden ayarla |
| keywords | string[] | Hayır | - | Eklenecek veya ayarlanacak anahtar kelimeler/etiketler |
| keywordsMode | string | Hayır | `"add"` | Anahtar kelimelerin nasıl işleneceği: `add` (ekle) veya `set` (değiştir) |
| fieldsToRemove | string[] | Hayır | `[]` | Kaldırılacak belirli meta veri alanı adlarının listesi |
| iptcTitle | string | Hayır | - | IPTC Object Name |
| iptcHeadline | string | Hayır | - | IPTC Headline |
| iptcCity | string | Hayır | - | IPTC City |
| iptcState | string | Hayır | - | IPTC Province/State |
| iptcCountry | string | Hayır | - | IPTC Country |

## Örnek İstek {#example-request}

Yazar ve telif hakkını ayarla:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

GPS koordinatlarını ayarla:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

GPS'i kaldır ve anahtar kelimeler ekle:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Meta veriyi incele:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Örnek Yanıt (Düzenle) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notlar {#notes}

- Bu araç, sunucuda ExifTool'un kurulu olmasını gerektirir. Docker imajına dahildir.
- Meta veriler yerinde yazılır, bu nedenle piksel yeniden kodlaması gerçekleşmez. Dosya boyutu değişikliği minimaldir (yalnızca meta veri baytları).
- `dateShift` parametresi, tüm tarih alanlarını belirtilen ofset kadar kaydırır ve saat dilimi hatalarını düzeltmek için kullanışlıdır (örn. `+02:00` veya `-05:30`).
- Hiçbir değişiklik istenmezse (tüm parametreler atlanmış veya boşsa), orijinal dosya değiştirilmeden döndürülür.
- Desteklenen biçimler: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Tarayıcıda önizlenemeyen biçimler (HEIF, TIFF) için yanıt, WebP önizlemesi içeren bir `previewUrl` alanı içerir.
