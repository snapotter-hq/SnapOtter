---
description: "Birden fazla görüntüyü 25'ten fazla şablon, ayarlanabilir boşluklar ve köşeler ve hücre başına kaydırma ve yakınlaştırma ile ızgara kolajlarında birleştirin."
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: 32baf2d667fc
---

# Kolaj / Izgara {#collage-grid}

Birden fazla görüntüyü 25'ten fazla şablonla güzel ızgara kolajlarında birleştirin. Özelleştirilebilir boşluk, köşe yarıçapı, arka plan rengi ve hücre başına kaydırma/yakınlaştırma denetimleriyle 2-9 görüntülü düzenleri destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| templateId | string | Evet | - | Şablon düzeni kimliği (örn. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Hayır | - | `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` içeren hücre başına ayarlar dizisi |
| cells[].imageIndex | integer | Evet | - | Bu hücreye yerleştirilecek görüntünün dizini (0 tabanlı) |
| cells[].panX | number | Hayır | 0 | Yatay kaydırma ofseti (-100 ile 100 arası) |
| cells[].panY | number | Hayır | 0 | Dikey kaydırma ofseti (-100 ile 100 arası) |
| cells[].zoom | number | Hayır | 1 | Yakınlaştırma düzeyi (1 ile 10 arası) |
| cells[].objectFit | string | Hayır | `"cover"` | Görüntünün hücreyi nasıl doldurduğu: `cover` veya `contain` |
| gap | number | Hayır | 8 | Hücreler arasındaki boşluk, piksel cinsinden (0 ile 500 arası) |
| cornerRadius | number | Hayır | 0 | Her hücre için köşe yarıçapı, piksel cinsinden (0 ile 500 arası) |
| backgroundColor | string | Hayır | `"#FFFFFF"` | Arka plan rengi, hex olarak veya `"transparent"` |
| aspectRatio | string | Hayır | `"free"` | Tuval en boy oranı: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Hayır | `"png"` | Çıktı biçimi: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Hayır | 90 | Çıktı kalitesi (1 ile 100 arası) |

## Kullanılabilir Şablonlar {#available-templates}

| Şablon Kimliği | Görüntüler | Düzen |
|-------------|--------|--------|
| `2-h-equal` | 2 | İki eşit sütun |
| `2-v-equal` | 2 | İki eşit satır |
| `2-h-left-large` | 2 | Sol 2/3, sağ 1/3 |
| `2-h-right-large` | 2 | Sol 1/3, sağ 2/3 |
| `3-left-large` | 3 | Büyük sol, sağda iki üst üste |
| `3-right-large` | 3 | Solda iki üst üste, büyük sağ |
| `3-top-large` | 3 | Büyük üst, altta iki sütun |
| `3-h-equal` | 3 | Üç eşit sütun |
| `3-v-equal` | 3 | Üç eşit satır |
| `4-grid` | 4 | 2x2 ızgara |
| `4-left-large` | 4 | Büyük sol, sağda üç üst üste |
| `4-top-large` | 4 | Büyük üst, altta üç sütun |
| `4-bottom-large` | 4 | Üstte üç sütun, büyük alt |
| `5-top2-bottom3` | 5 | Üstte iki, altta üç |
| `5-top3-bottom2` | 5 | Üstte üç, altta iki |
| `5-left-large` | 5 | Büyük sol, sağda dört üst üste |
| `5-center-large` | 5 | Büyük merkez, dört köşe |
| `6-grid-2x3` | 6 | 2 sütun x 3 satır |
| `6-grid-3x2` | 6 | 3 sütun x 2 satır |
| `6-top-large` | 6 | Büyük üst, altta beş sütun |
| `7-mosaic` | 7 | Mozaik düzeni |
| `8-mosaic` | 8 | Mozaik düzeni |
| `9-grid` | 9 | 3x3 ızgara |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notlar {#notes}

- Çok parçalı istekte birden fazla görüntü dosyası yükleyin. Görüntüler, yükleme sırasına göre şablon hücrelerine atanır.
- Şablonun desteklediğinden daha fazla görüntü yüklenirse, fazladan görüntüler yok sayılır.
- HEIC, RAW, PSD ve SVG giriş biçimlerini destekler (otomatik olarak çözülür).
- Tuvalin temel boyutu en uzun kenarda 2400px'dir ve seçilen en boy oranına göre ölçeklenir.
- `aspectRatio` değeri `"free"` olduğunda, tuval varsayılan olarak 4:3'e (2400x1800) ayarlanır.
- Hücre başına `panX`/`panY` değerleri, kırpma penceresini hücre içinde kaydırır. 100 değeri bir kenara tamamen, -100 diğer kenara taşır.
- `"transparent"` arka plan rengi yalnızca `png`, `webp` veya `avif` çıktı biçimleriyle korunur.
