---
description: "Konum ve boyutlarla bir bölge belirterek görüntüleri kırpın."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: 0cccc18a666b
---

# Görüntü Kırp {#crop}

Konum ve boyut kullanarak dikdörtgen bir bölge tanımlayarak görüntüleri kırpın. Hem piksel hem de yüzde birimlerini destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/crop`

Bir görüntü dosyası ve bir JSON `settings` alanı ile çok parçalı form verilerini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| left | number | Evet | - | Kırpma bölgesinin X ofseti (sol kenardan) |
| top | number | Evet | - | Kırpma bölgesinin Y ofseti (üst kenardan) |
| width | number | Evet | - | Kırpma bölgesinin genişliği |
| height | number | Evet | - | Kırpma bölgesinin yüksekliği |
| unit | string | Hayır | `"px"` | Değerler için birim: `px` veya `percent` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Yüzde değerlerini kullanarak kırpma:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notlar {#notes}

- Kırpma bölgesi görüntü sınırları içine sığmalıdır. Bölge görüntünün ötesine uzanırsa, istek başarısız olur.
- `percent` birimi kullanıldığında, değerler görüntü boyutlarının yüzdelerini temsil eder (örn. `left: 10`, sol kenardan %10 anlamına gelir).
- Çıktı biçimi giriş biçimiyle eşleşir.
- Kırpmadan önce EXIF yönlendirmesi otomatik olarak uygulanır, bu nedenle koordinatlar görsel olarak doğru yönlendirmeye karşılık gelir.
