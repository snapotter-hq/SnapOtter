---
description: "Görselleri herhangi bir açıyla döndürün ve yatay veya dikey olarak çevirin."
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: 7c555cd57021
---

# Görüntü Döndür ve Çevir {#rotate-flip}

Görselleri isteğe bağlı bir açıyla döndürün ve/veya yatay ya da dikey olarak çevirin. Döndürme ve çevirme işlemleri tek bir istekte birleştirilebilir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Bir görsel dosyası ve bir JSON `settings` alanı içeren çok parçalı form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| angle | number | Hayır | `0` | Derece cinsinden döndürme açısı (saat yönünde). Herhangi bir sayısal değeri kabul eder. |
| horizontal | boolean | Hayır | `false` | Görseli yatay olarak çevir (ayna) |
| vertical | boolean | Hayır | `false` | Görseli dikey olarak çevir |

## Örnek İstek {#example-request}

Saat yönünde 90 derece döndür:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Yatay olarak çevir:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Birlikte döndür ve çevir:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notlar {#notes}

- Önce döndürme, ardından çevirme işlemleri uygulanır.
- 90 dereceden farklı döndürmeler (örn. 45 derece), çıktı biçimine bağlı olarak saydam veya siyah dolguyla döndürülen görsele sığacak şekilde tuvali büyütür.
- Yaygın değerler: çeyrek tur döndürmeler için 90, 180, 270.
- İşlemden önce EXIF yönlendirmesi otomatik olarak uygulanır; bu nedenle döndürme, görsel yönlendirmeye görelidir.
