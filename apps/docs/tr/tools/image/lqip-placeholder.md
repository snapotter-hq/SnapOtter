---
description: "Base64 veri URI'siyle birlikte küçük bir düşük kaliteli görsel yer tutucu üretin."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 6be095dcbe73
---

# LQIP Yer Tutucu {#lqip-placeholder}

Bir kaynak görselden küçük bir düşük kaliteli görsel yer tutucu (LQIP) üretin. Anında gömme için küçük bir yer tutucu dosyasını, bir base64 veri URI'si, kullanıma hazır HTML `<img>` etiketi ve CSS `background-image` parçacığıyla birlikte döndürür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Bir görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| width | integer | Hayır | `16` | Piksel cinsinden hedef genişlik (4-64) |
| blur | number | Hayır | `2` | Bulanıklık stratejisi için bulanıklık yarıçapı (0-20) |
| strategy | string | Hayır | `"blur"` | Yer tutucu stratejisi: `blur`, `pixelate` veya `solid` |
| format | string | Hayır | `"webp"` | Çıktı biçimi: `webp`, `png` veya `jpeg` |
| quality | integer | Hayır | `50` | Çıktı kalitesi (1-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Notlar {#notes}

- `dataUri` alanı, ek istek olmadan `src` özniteliklerinde veya CSS'de kullanıma hazır tam veri URI'sini içerir.
- `html` ve `css` alanları, yaygın kullanım senaryoları için kopyala-yapıştır parçacıkları sağlar.
- `blur` stratejisi, yumuşak, bulanık bir küçük resim üretir. `pixelate` stratejisi, bloklu bir mozaik oluşturur. `solid` stratejisi, tek bir ortalanmış renk döndürür.
- Tipik yer tutucu boyutları 200-500 bayttır; bu da onları doğrudan HTML'e satır içi eklemeye uygun hale getirir.
- Yükseklik, kaynak görselin en boy oranını korumak için otomatik olarak hesaplanır.
- HEIC, RAW, PSD ve SVG girişleri işlemeden önce otomatik olarak çözümlenir.
