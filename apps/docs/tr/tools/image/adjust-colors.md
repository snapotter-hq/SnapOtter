---
description: "Parlaklık, kontrast, doygunluk, sıcaklık, ton, kanallar ayarlayın ve renk efektleri uygulayın."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 31104c563c12
---

# Renkleri Ayarla {#adjust-colors}

Parlaklık, kontrast, pozlama, doygunluk, sıcaklık, renk tonu, ton döndürme, kanal başına seviyeler ve tek tıkla efektleri (gri tonlama, sepya, ters çevir) tek bir uç noktada birleştiren kapsamlı renk ayarlama aracı.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Bir görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| brightness | sayı | Hayır | `0` | Parlaklık ayarı (-100 ile 100 arası) |
| contrast | sayı | Hayır | `0` | Kontrast ayarı (-100 ile 100 arası) |
| exposure | sayı | Hayır | `0` | Pozlama / orta ton gama (-100 ile 100 arası) |
| saturation | sayı | Hayır | `0` | Renk doygunluğu (-100 ile 100 arası) |
| temperature | sayı | Hayır | `0` | Beyaz dengesi: soğuk/mavi ile sıcak/turuncu arası (-100 ile 100 arası) |
| tint | sayı | Hayır | `0` | Renk tonu kayması: yeşil ile macenta arası (-100 ile 100 arası) |
| hue | sayı | Hayır | `0` | Derece cinsinden ton döndürme (-180 ile 180 arası) |
| sharpness | sayı | Hayır | `0` | Keskinleştirme gücü (0 ile 100 arası) |
| red | sayı | Hayır | `100` | Kırmızı kanal seviyesi (0 ile 200 arası, 100 = değişmemiş) |
| green | sayı | Hayır | `100` | Yeşil kanal seviyesi (0 ile 200 arası, 100 = değişmemiş) |
| blue | sayı | Hayır | `100` | Mavi kanal seviyesi (0 ile 200 arası, 100 = değişmemiş) |
| effect | dize | Hayır | `"none"` | Renk efekti: `none`, `grayscale`, `sepia`, `invert` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Sıcak, retro bir görünüm uygulayın:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
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

- Tüm parametreler nötr değerlere varsayılır; böylece yalnızca ihtiyacınız olanı ayarlayabilirsiniz.
- Ayarlamalar şu sırayla uygulanır: parlaklık, kontrast, pozlama, doygunluk/ton, sıcaklık/renk tonu, keskinlik, kanallar, efektler.
- Sıcaklık, mavi-turuncu ve yeşil-macenta eksenlerinde 3x3 renk yeniden birleştirme matrisi kullanır.
- Pozlama, Sharp'ın gama işlevine eşlenir (pozitif orta tonları aydınlatır, negatif karartır).
- Bu uç nokta, eski `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` ve `/api/v1/tools/image/color-effects` yollarında da yanıt verir. Hepsi aynı şemayı kullanır.
- Çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girişleri işlenmeden önce otomatik olarak çözülür.
