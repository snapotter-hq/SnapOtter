---
description: "Görselin tamamına veya belirli bir bölgeye pikselleştirme efekti uygulayın."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 3edf20830cf7
---

# Pikselleştir {#pixelate}

Görselin tamamına veya belirli bir dikdörtgen bölgeye pikselleştirme efekti uygulayın. Yüzler, plakalar veya kişisel bilgiler gibi hassas içerikleri gizlemek için kullanışlıdır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Bir görsel dosyası ve bir JSON `settings` alanı içeren çok parçalı form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Hayır | `12` | Piksel blok boyutu (2-128); daha büyük değerler daha kaba pikselleştirme üretir |
| region | object | Hayır | - | Pikselleştirmeyi bir dikdörtgenle sınırla (aşağıya bakın) |

### Bölge Nesnesi {#region-object}

| Alan | Tür | Zorunlu | Açıklama |
|-------|------|----------|-------------|
| left | integer | Evet | Piksel cinsinden sol ofset (>= 0) |
| top | integer | Evet | Piksel cinsinden üst ofset (>= 0) |
| width | integer | Evet | Piksel cinsinden bölge genişliği (>= 1) |
| height | integer | Evet | Piksel cinsinden bölge yüksekliği (>= 1) |

## Örnek İstek {#example-request}

Tüm görseli pikselleştir:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Belirli bir bölgeyi pikselleştir:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notlar {#notes}

- `region` belirtilmediğinde, görselin tamamı pikselleştirilir.
- Bölge koordinatları, görselin sol üst köşesine göre piksel cinsindendir. Bölge, görsel sınırları içinde kalmalıdır.
- Çıktı biçimi girdi biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girdileri işlemden önce otomatik olarak çözülür.
