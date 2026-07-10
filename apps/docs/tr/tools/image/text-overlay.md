---
description: "Gölge düşürme ve arka plan kutularıyla stilize metin katmanları ekleyin."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 23218e865407
---

# Metin Katmanı {#text-overlay}

Görüntülere isteğe bağlı gölge düşürme ve yarı saydam arka plan kutusuyla stilize metin ekleyin. Fotoğraflarda başlıklar, altyazılar veya açıklamalar için uygundur.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Bir görüntü dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| text | string | Evet | - | Katman metni (1 ile 500 karakter arası) |
| fontSize | number | Hayır | `48` | Piksel cinsinden yazı tipi boyutu (8 ile 200 arası) |
| color | string | Hayır | `"#FFFFFF"` | Hex biçiminde metin rengi (`#RRGGBB`) |
| position | string | Hayır | `"bottom"` | Dikey yerleşim: `top`, `center`, `bottom` |
| backgroundBox | boolean | Hayır | `false` | Metnin arkasında yarı saydam arka plan dikdörtgeni göster |
| backgroundColor | string | Hayır | `"#000000"` | Hex biçiminde arka plan kutusu rengi (`#RRGGBB`) |
| shadow | boolean | Hayır | `true` | Metnin arkasına gölge düşürme uygula |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Arka plan kutusuyla:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notlar {#notes}

- Metin her zaman görüntü içinde yatay olarak ortalanır.
- Gölge düşürme, %70 siyah opaklıkta 3px bulanıklıkla 2px kaydırma kullanır.
- Arka plan kutusu, yazı tipi boyutuyla orantılı yükseklikte (1.8 katı), %70 opaklıkta tüm görüntü genişliğini kaplar.
- Metin SVG kompozit aracılığıyla render edilir, bu nedenle sistemin varsayılan sans-serif yazı tipi kullanılır.
- Metindeki XML özel karakterleri güvenli bir şekilde kaçırılır.
- Çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girdileri işlenmeden önce otomatik olarak çözülür.
