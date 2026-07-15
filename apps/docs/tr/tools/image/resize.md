---
description: "Görselleri piksel, yüzde veya sığdırma modlarıyla yeniden boyutlandırın."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: f5e1119e470e
---

# Görüntü Boyutlandır {#resize}

Görselleri tam piksel boyutları, bir yüzde ölçek katsayısı veya görselin hedef boyutlara nasıl uyum sağlayacağını denetleyen bir sığdırma modu belirterek yeniden boyutlandırın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/resize`

Bir görsel dosyası ve bir JSON `settings` alanı içeren çok parçalı form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| width | integer | Hayır | - | Piksel cinsinden hedef genişlik (en fazla 16383) |
| height | integer | Hayır | - | Piksel cinsinden hedef yükseklik (en fazla 16383) |
| fit | string | Hayır | `"contain"` | Görselin boyutlara nasıl sığdığı: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | Hayır | `false` | Görsel hedeften küçükse büyütmeyi önle |
| percentage | number | Hayır | - | Yüzdeye göre ölçekle (örn. yarı boyut için 50) |

`width`, `height` veya `percentage` değerlerinden en az biri sağlanmalıdır.

### Sığdırma Modları {#fit-modes}

- **contain** - En boy oranını koruyarak boyutlara sığacak şekilde yeniden boyutlandırır (boş alan bırakabilir)
- **cover** - En boy oranını koruyarak boyutları kaplayacak şekilde yeniden boyutlandırır (kırpabilir)
- **fill** - Boyutlara tam olarak eşleşecek şekilde uzatır (en boy oranını göz ardı eder)
- **inside** - `contain` gibidir, ancak yalnızca küçültür, asla büyütmez
- **outside** - `cover` gibidir, ancak yalnızca küçültür, asla büyütmez

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Yüzdeye göre yeniden boyutlandır:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notlar {#notes}

- Her iki eksende de maksimum boyut 16383 pikseldir (Sharp/libvips sınırı).
- Çıktı biçimi girdi biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girdileri işlemden önce otomatik olarak çözülür.
- Yeniden boyutlandırmadan önce EXIF yönlendirmesi otomatik olarak uygulanır.
- `withoutEnlargement` bayrağı, bazı görsellerin zaten hedeften küçük olabileceği toplu işleme için kullanışlıdır.
