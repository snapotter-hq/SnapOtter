---
description: "Özel renkler ve hata düzeltme seviyeleriyle QR kodları oluşturun."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 6e888be32809
---

# QR Kodu Oluşturucu {#qr-code-generator}

Yapılandırılabilir boyut, hata düzeltme seviyesi ve özel ön plan/arka plan renkleriyle metin veya URL'lerden QR kodu görselleri oluşturun.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Bir **JSON gövdesi** kabul eder (çok parçalı değil). Dosya yüklemeye gerek yoktur.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| text | string | Evet | - | QR koduna kodlanacak içerik (1 ile 2000 karakter arası) |
| size | number | Hayır | `400` | Piksel cinsinden çıktı görseli genişliği/yüksekliği (100 ile 10000 arası) |
| errorCorrection | string | Hayır | `"M"` | Hata düzeltme seviyesi: `L` (%7), `M` (%15), `Q` (%25), `H` (%30) |
| foreground | string | Hayır | `"#000000"` | Hex cinsinden QR kodu ön plan/modül rengi (`#RRGGBB`) |
| background | string | Hayır | `"#FFFFFF"` | Hex cinsinden QR kodu arka plan rengi (`#RRGGBB`) |
| logoDataUri | string | Hayır | - | Veri URI'si olarak logo görseli (`data:image/png;base64,...` veya `data:image/jpeg;base64,...`, en fazla 700 KB). QR kodunun ortasında QR boyutunun %22'sinde konumlandırılır. Hata düzeltmeyi `H` değerine zorlar |

### Hata Düzeltme Seviyeleri {#error-correction-levels}

| Seviye | Kurtarma | Kullanım Durumu |
|-------|----------|----------|
| `L` | ~%7 | Maksimum veri yoğunluğu |
| `M` | ~%15 | Dengeli (varsayılan) |
| `Q` | ~%25 | Basılı kodlar için iyi |
| `H` | ~%30 | Logo kaplamalı kodlar için en iyisi |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Özel renklerle markalı QR kodu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notlar {#notes}

- Bu uç nokta, görsel yüklemeye gerek olmadığından çok parçalı form verisi değil JSON kabul eder.
- Çıktı her zaman bir PNG görselidir.
- Çıktı dosya adı her zaman `qrcode.png` şeklindedir.
- Bu araç görselleri sıfırdan oluşturduğundan `originalSize` her zaman 0'dır.
- QR kodunun etrafında 2 modüllük bir sessiz bölge (kenar boşluğu) bulunur.
- Maksimum metin uzunluğu 2000 karakterdir. Gerçek kapasite, hata düzeltme seviyesine ve karakter kodlamasına bağlıdır.
- Daha yüksek hata düzeltme seviyeleri, QR kodunun kısmen gizlenmiş olsa bile taranabilir kalmasını sağlar ancak veri kapasitesini azaltır.
- Bir `logoDataUri` sağlandığında, logonun ortayı kapatmasına rağmen QR kodunun taranabilir kalması için hata düzeltmesi otomatik olarak `H` (%30) değerine zorlanır.
