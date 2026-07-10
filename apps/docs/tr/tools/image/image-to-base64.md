---
description: "HTML, CSS ve daha fazlasına gömmek için görselleri base64 veri URI'lerine dönüştürün."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 380e67cfd1d3
---

# Görselden Base64'e {#image-to-base64}

Bir veya daha fazla görseli base64 kodlu dizelere ve veri URI'lerine dönüştürün. İsteğe bağlı biçim dönüştürme, kalite kontrolü ve yeniden boyutlandırmayı destekler. Görselleri doğrudan HTML, CSS, JSON veya e-posta şablonlarına gömmek için kullanışlıdır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Bir veya daha fazla görsel dosyası ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Hayır | `"original"` | Kodlamadan önce dönüştür: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Hayır | `80` | Kayıplı biçimler için çıktı kalitesi (1 ile 100 arası) |
| maxWidth | number | Hayır | `0` | Piksel cinsinden maksimum genişlik (0 = yeniden boyutlandırma yok, büyütmez) |
| maxHeight | number | Hayır | `0` | Piksel cinsinden maksimum yükseklik (0 = yeniden boyutlandırma yok, büyütmez) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Birden fazla dosya:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Yanıt Alanları {#response-fields}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| results | array | Başarıyla dönüştürülen görseller |
| errors | array | İşlenemeyen görseller (dosya adı ve hata mesajıyla birlikte) |

### Sonuç Nesnesi {#result-object}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| filename | string | Orijinal dosya adı |
| mimeType | string | Kodlanmış çıktının MIME türü |
| width | number | Piksel cinsinden nihai genişlik (herhangi bir yeniden boyutlandırma sonrası) |
| height | number | Piksel cinsinden nihai yükseklik (herhangi bir yeniden boyutlandırma sonrası) |
| originalSize | number | Bayt cinsinden orijinal dosya boyutu |
| encodedSize | number | Bayt cinsinden base64 dizesinin boyutu |
| overheadPercent | number | Orijinale kıyasla yüzde boyut farkı (pozitif = daha büyük, negatif = daha küçük) |
| base64 | string | Ham base64 kodlu görsel verisi |
| dataUri | string | `src` özniteliklerinde kullanıma hazır tam veri URI'si |

## Notlar {#notes}

- Base64 kodlama tipik olarak ikili dosyaya kıyasla boyutu yaklaşık %33 artırır. `overheadPercent` alanı gerçek farkı gösterir.
- `outputFormat` değeri `"original"` olduğunda, HEIC/HEIF dosyaları JPEG'e dönüştürülür (tarayıcılar HEIC'i veri URI'lerinde gösteremediği için).
- `maxWidth` ve `maxHeight` seçenekleri, `withoutEnlargement` ile `fit: inside` kullanarak yeniden boyutlandırır; bu nedenle belirtilen boyutlardan küçük görseller büyütülmez.
- Tek bir istekte birden fazla dosya işlenebilir. Her dosya bağımsız olarak işlenir ve başarısızlıklar diğer dosyaların başarılı olmasını engellemez.
- SVG dosyaları, yeniden kodlanmadan `image/svg+xml` olarak aktarılır (bir biçim dönüştürmesi istenmediği sürece).
- Bu, salt okunur bir uç noktadır. İndirilebilir bir dosya veya bir `jobId` üretmez. Base64 verisi doğrudan yanıt gövdesinde döndürülür.
