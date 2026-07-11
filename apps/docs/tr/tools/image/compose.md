---
description: "Kompozit için görüntüleri konum, opaklık ve harmanlama modlarıyla katmanlayın."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 30a96db223c7
---

# Görüntü Kompozisyonu {#image-composition}

Yapılandırılabilir konum, opaklık ve harmanlama moduyla bir temel görüntünün üzerine bir yer paylaşım görüntüsü katmanlayın. Logoları, grafikleri kompozit etmek veya birden fazla görüntüyü birleştirmek için kullanışlıdır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/compose`

**İki** görüntü dosyası ve bir JSON `settings` alanı ile çok parçalı form verilerini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| x | number | Hayır | `0` | Yer paylaşımının sol üst köşeden yatay ofseti, piksel cinsinden (min 0) |
| y | number | Hayır | `0` | Yer paylaşımının sol üst köşeden dikey ofseti, piksel cinsinden (min 0) |
| opacity | number | Hayır | `100` | Yer paylaşımı opaklık yüzdesi (0 ile 100 arası) |
| blendMode | string | Hayır | `"over"` | Kompozit harmanlama modu |

### Harmanlama Modları {#blend-modes}

| Değer | Açıklama |
|-------|-------------|
| `over` | Normal yer paylaşımı (varsayılan) |
| `multiply` | Piksel değerlerini çarparak koyulaştırma |
| `screen` | Tersine çevirerek, çarparak ve tekrar tersine çevirerek açma |
| `overlay` | Temel parlaklığa göre çarpma ve ekranı birleştirir |
| `darken` | Her katmandan daha koyu pikseli korur |
| `lighten` | Her katmandan daha açık pikseli korur |
| `hard-light` | Güçlü kontrast yer paylaşımı |
| `soft-light` | İnce kontrast yer paylaşımı |
| `difference` | Katmanlar arasındaki mutlak fark |
| `exclusion` | Farka benzer ancak daha düşük kontrast |

### Dosya Alanları {#file-fields}

| Alan Adı | Zorunlu | Açıklama |
|------------|----------|-------------|
| file | Evet | Temel/arka plan görüntüsü |
| overlay | Evet | Yer paylaşımı/ön plan görüntüsü |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Çarpma harmanlama modunu kullanma:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notlar {#notes}

- Her iki görüntü de kompozit etmeden önce doğrulanır ve çözülür (HEIC, RAW, PSD, SVG desteklenir).
- Yer paylaşımı, `x` ve `y` tarafından belirtilen tam piksel koordinatlarına yerleştirilir. Sığdırmak için yeniden boyutlandırılmaz.
- Opaklık 100'den azsa, harmanlamadan önce yer paylaşımına bir alfa maskesi uygulanır.
- Yer paylaşımı, temel görüntü sınırlarının ötesine uzanabilir (kırpılır).
- İşlemeden önce her iki görüntüde EXIF yönlendirmesi otomatik olarak uygulanır.
- Çıktı boyutları, temel görüntü boyutlarıyla eşleşir.
