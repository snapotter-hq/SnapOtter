---
description: "Gizlilik ve daha küçük dosya boyutları için görüntülerden EXIF, GPS, ICC ve XMP meta verilerini kaldırın."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: fdd4a93992b6
---

# Görüntü Meta Verisi Kaldır {#remove-metadata}

Görüntülerden EXIF, GPS, ICC renk profilleri ve XMP meta verilerini kaldırın. Gizlilik (GPS koordinatlarını, kamera bilgilerini kaldırma) ve dosya boyutunu küçültme için kullanışlıdır.

## API Uç Noktaları {#api-endpoints}

### Meta Verileri Kaldır {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Görüntüyü işler ve seçilen meta verileri kaldırılmış temizlenmiş bir sürüm döndürür.

### Meta Verileri İncele {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Görüntüyü değiştirmeden ayrıştırılmış meta verileri JSON olarak döndürür. Kaldırmadan önce hangi meta verinin var olduğunu önizlemek için kullanışlıdır.

## Parametreler (Kaldırma) {#parameters-strip}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Hayır | `false` | EXIF verilerini kaldır (kamera ayarları, tarihler vb.) |
| stripGps | boolean | Hayır | `false` | Yalnızca GPS/konum verilerini kaldır |
| stripIcc | boolean | Hayır | `false` | ICC renk profilini kaldır |
| stripXmp | boolean | Hayır | `false` | XMP meta verilerini kaldır (Adobe, IPTC) |
| stripAll | boolean | Hayır | `true` | Tüm meta verileri tek seferde kaldır |

`stripAll` değeri `true` olduğunda, tek tek bayrakları geçersiz kılar ve her şeyi kaldırır.

## Örnek İstek {#example-request}

Tüm meta verileri kaldır:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Yalnızca GPS verilerini kaldır (kamera bilgilerini ve renk profilini koru):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Değiştirmeden meta verileri incele:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Örnek Yanıt (Kaldırma) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Örnek Yanıt (İnceleme) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notlar {#notes}

- Görüntü, kaldırma işleminden sonra orijinal biçiminde yeniden kodlanır. JPEG, 90 kalitede mozjpeg kullanır; PNG, 9 sıkıştırma düzeyi kullanır; WebP, 85 kalite kullanır.
- ICC profillerinin kaldırılması, görüntü sRGB olmayan bir profille etiketlenmişse ince renk kaymalarına neden olabilir. Renk doğruluğu önemliyse `stripIcc: false` kullanın.
- İnceleme uç noktası, kolaylık için GPS koordinatlarını ondalık enlem/boylam değerlerine (alt çizgi ön ekli) ayrıştırır.
- Desteklenen giriş biçimleri: JPEG, PNG, WebP, AVIF, TIFF, GIF.
