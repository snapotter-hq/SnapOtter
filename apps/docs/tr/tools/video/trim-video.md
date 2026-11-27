---
description: "Başlangıç ve bitiş zamanlarını belirterek bir videodan bir klip kesin."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: d750cb5d3319
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Bir videodan bir klip kesin. Başlangıç ve bitiş zamanı arasındaki bölümü tutabilir ya da baştan ve sondan sabit bir süre kesebilirsiniz. Kare hassasiyetli kesim seçeneği de vardır.

Uygulamada zaman alanları düz saniye (`90`), `MM:SS` (`1:30`) veya `HH:MM:SS` (`1:02:03.5`) biçimini kabul eder. API saniye cinsinden değer alır.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range`, `startS` ile `endS` arasını tutar. `ends`, baştan `cutStartS` ve sondan `cutEndS` kadar süreyi çıkarır |
| startS | number | No | `0` | Aralık modu: saniye cinsinden başlangıç zamanı (>= 0 olmalıdır) |
| endS | number | Range mode | - | Aralık modu: saniye cinsinden bitiş zamanı (startS'den sonra olmalıdır) |
| cutStartS | number | No | `0` | Uç modu: baştan çıkarılacak saniye |
| cutEndS | number | No | `0` | Uç modu: sondan çıkarılacak saniye |
| precise | boolean | No | `false` | Bir sonraki anahtar kareden kopyalamak yerine, başlangıç ve bitiş karelerinin tam olması için tüm aralığı yeniden kodla |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Videonun uzunluğu ne olursa olsun ilk 5 saniyeyi ve son 10 saniyeyi kesin:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- `precise` değeri `false` olduğunda (varsayılan), klip tam olarak istediğiniz karede başlar. Yalnızca bu başlangıç ile bir sonraki anahtar kare arasındaki kareler yeniden kodlanır, geri kalanı kopyalanır, bu yüzden hızlı kalır. Kopyalanan akış, önceki karelere bağlı kareleri de koruduğu için bitiş bir kare kadar uzun sürebilir. Güvenli biçimde birleştirilemeyen kaynaklar (10 bit veya aralıklı (interlaced) H.264, yeniden kodlanmış bir başlangıç gerektiren diğer kodekler ya da AVI, FLV, MPEG ve TS dosyaları) bunun yerine tamamen yeniden kodlanır.
- `precise` değerini `true` yapmak her zaman tüm aralığı yeniden kodlar, böylece her iki uç da tam olur ancak daha uzun sürer.
- Aralık modunda `endS`, `startS` değerinden büyük olmalıdır. `endS` videonun sonunu aşarsa klip sona kadar sürer.
- Uç modunda `cutStartS` ve `cutEndS` değerlerinden en az biri sıfırdan büyük olmalı ve ikisi birlikte videonun bir kısmını bırakmalıdır. Kesim her dosyanın kendi uzunluğuna göre hesaplandığı için tek bir ayar, farklı sürelere sahip bir video grubunda çalışır.
