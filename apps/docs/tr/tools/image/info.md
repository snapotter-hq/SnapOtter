---
description: "Ayrıntılı görsel meta verilerini, özelliklerini ve kanal başına histogram istatistiklerini görüntüleyin."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 3100e52f0206
---

# Görsel Bilgisi {#image-info}

Boyutlar, biçim, renk uzayı, EXIF/ICC/XMP varlığı ve kanal başına histogram istatistikleri dahil kapsamlı görsel meta verilerini döndüren salt okunur analiz aracı. İşlenmiş bir çıktı dosyası üretmez.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/info`

Bir görsel dosyası içeren multipart form verisini kabul eder. Ayar alanı gerekmez.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Sadece görsel dosyasını yükleyin.

| Alan | Tür | Zorunlu | Açıklama |
|-------|------|----------|-------------|
| file | file | Evet | Analiz edilecek görsel |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Örnek Yanıt {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Yanıt Alanları {#response-fields}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| filename | string | Temizlenmiş dosya adı |
| fileSize | number | Bayt cinsinden dosya boyutu |
| width | number | Piksel cinsinden görsel genişliği |
| height | number | Piksel cinsinden görsel yüksekliği |
| format | string | Algılanan biçim (jpeg, png, webp vb.) |
| channels | number | Renk kanallarının sayısı |
| hasAlpha | boolean | Görselin bir alfa kanalı olup olmadığı |
| colorSpace | string | Renk uzayı (srgb, cmyk vb.) |
| density | number veya null | DPI/PPI çözünürlüğü |
| isProgressive | boolean | JPEG'in progresif kodlama kullanıp kullanmadığı |
| orientation | number veya null | EXIF yönlendirme değeri (1-8) |
| hasProfile | boolean | Gömülü bir ICC profilinin olup olmadığı |
| hasExif | boolean | EXIF meta verisinin mevcut olup olmadığı |
| hasIcc | boolean | Bir ICC renk profilinin mevcut olup olmadığı |
| hasXmp | boolean | XMP meta verisinin mevcut olup olmadığı |
| bitDepth | string veya null | Örnek başına bit |
| pages | number | Sayfa sayısı (TIFF, GIF gibi çok sayfalı biçimler için) |
| histogram | array | Kanal başına istatistikler (min, maks, ortalama, standart sapma) |

## Notlar {#notes}

- Bu, salt okunur bir uç noktadır. İndirilebilir bir çıktı dosyası veya bir `jobId` üretmez.
- RAW biçimli görseller (DNG, CR2, NEF, ARW vb.) için, Sharp'ın doğrudan okuyamadığı gerçek sensör boyutlarını ve meta veri bayraklarını çıkarmak amacıyla ExifTool kullanılır.
- HEIC/HEIF dosyaları, Sharp HEVC pikselleri çözümleyemediği için piksel istatistiklerini çıkarmak amacıyla dahili olarak PNG'ye çözümlenir.
- Histogram, tam bir 256 bölmeli dağılım değil, kanal başına min/maks/ortalama/standart sapma sağlar.
- `density` alanı, varsa gömülü DPI meta verisini yansıtır.
