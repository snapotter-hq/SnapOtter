---
description: "Yazı tiplerini TTF, OTF, WOFF ve WOFF2 arasında dönüştürün."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 75c2d2ba0c73
i18n_hash_version: 2
---

# Yazı Tipi Dönüştür {#convert-font}

Bir yazı tipi dosyasını TrueType (TTF), OpenType CFF (OTF), WOFF ve WOFF2 arasında dönüştürür. Bir masaüstü yazı tipini web yazı tipine çevirmek ya da yalnızca TrueType kabul eden bir uygulama için OTF'den TTF elde etmek için kullanın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Bir `.ttf`, `.otf`, `.woff` veya `.woff2` dosyası ve bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| format | string | Hayır | `ttf` | Çıktı biçimi: `ttf`, `otf`, `woff` veya `woff2` |

## Örnek İstek {#example-request}

OTF'den TTF'ye:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

Web için TTF'den WOFF2'ye:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Notlar {#notes}

- WOFF ve WOFF2 aynı yazı tipi verisinin sıkıştırılmış sarmalayıcılarıdır, bu yüzden bu biçimlere ya da bu biçimlerden dönüştürmek ana hatları değiştirmez.
- OTF'den TTF'ye dönüştürme kübik (CFF) eğrileri ikinci dereceden TrueType eğrilerine çevirir. Her eğri orijinalden en fazla 1 yazı tipi birimi sapar; bu normal boyutlarda görünmez, ancak dönüştürme tam olarak geri alınamaz. TTF'den OTF'ye dönüştürme eğri şekillerini korur ve yalnızca kontrol noktalarını tam yazı tipi birimlerine yuvarlar.
- Yazı tipinin gömme izinleri (OS/2 `fsType` alanı) olduğu gibi korunur.
- Yazı tipi koleksiyonları (`.ttc`) desteklenmez. Değişken TrueType yazı tipleri OTF'ye, değişken CFF2 yazı tipleri de TTF'ye dönüştürülemez; bunları bunun yerine WOFF veya WOFF2'ye dönüştürün.
- Dönüştürme, API sürecinin içinde değil, diğer belge araçlarıyla aynı zaman aşımına sahip Python belge çalışanında yürütülür.
