---
description: "Biçim dönüştürme, kalite denetimi, yeniden boyutlandırma ve meta veri temizleme ile görselleri web sunumu için optimize edin."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 4e69388cadd6
---

# Web İçin Optimize Et {#optimize-for-web}

Görselleri tek adımda web sunumu için optimize edin. Biçim dönüştürme, kalite ayarı, isteğe bağlı yeniden boyutlandırma, aşamalı kodlama ve meta veri temizlemeyi bir araya getirir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Bir görsel dosyası ve bir JSON `settings` alanı içeren çok parçalı form verisi kabul eder.

Ayrıca gerçek zamanlı parametre ayarı için işlenen görseli doğrudan ikili olarak (çalışma alanı oluşturmadan) döndüren bir canlı önizleme uç noktası da `POST /api/v1/tools/image/optimize-for-web/preview` konumunda kullanılabilir.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| format | string | Hayır | `"webp"` | Çıktı biçimi: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | Hayır | `80` | Çıktı kalitesi (1-100) |
| maxWidth | number | Hayır | - | Piksel cinsinden maksimum genişlik. Görsel daha genişse küçültülür. |
| maxHeight | number | Hayır | - | Piksel cinsinden maksimum yükseklik. Görsel daha uzunsa küçültülür. |
| progressive | boolean | Hayır | `true` | Aşamalı/geçişli kodlamayı etkinleştir |
| stripMetadata | boolean | Hayır | `true` | EXIF, GPS, ICC ve XMP meta verilerini kaldır |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Agresif sıkıştırma ile AVIF için optimize et:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Önizleme Uç Noktası Yanıtı {#preview-endpoint-response}

Önizleme uç noktası (`/api/v1/tools/image/optimize-for-web/preview`) ikili görseli bilgilendirici başlıklarla doğrudan döndürür:

- `X-Original-Size` - Bayt cinsinden orijinal dosya boyutu
- `X-Processed-Size` - Bayt cinsinden işlenmiş dosya boyutu
- `X-Output-Filename` - URL kodlamalı çıktı dosya adı

## Notlar {#notes}

- Bu araç, web varlıkları için tek noktadan bir optimizasyon boru hattı olarak tasarlanmıştır. Biçim dönüştürme, kalite ayarı, maksimum boyut sınırlama ve meta veri kaldırmayı tek geçişte yürütür.
- Çıktı dosya adı uzantısı, seçilen biçimle eşleşecek şekilde güncellenir.
- JXL (JPEG XL) kodlaması özel bir CLI kodlayıcı kullanır. Görsel önce PNG olarak işlenir, ardından JXL'e kodlanır.
- Aşamalı kodlama, tarayıcıların tam görsel yüklenmeden önce düşük kaliteli bir önizleme oluşturmasına izin vererek JPEG ve PNG için algılanan yükleme süresini iyileştirir.
- Önizleme uç noktası daha hafiftir (çalışma alanı/iş oluşturmaz) ve ön uçun canlı parametre ayarı arayüzü için tasarlanmıştır.
