---
description: "Başlangıç ve bitiş sürelerini belirterek bir ses dosyasından bir bölüm kesin."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 48d0b2595a93
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Bir ses dosyasından bir bölüm kesin. Başlangıç ve bitiş zamanı arasındaki kısmı tutabilir ya da baştan ve sondan sabit bir süre kesebilirsiniz.

Uygulamada zaman alanları düz saniye (`90`), `MM:SS` (`1:30`) veya `HH:MM:SS` (`1:02:03.5`) kabul eder. API saniye alır.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Bir ses dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` `startS` ile `endS` arasını tutar. `ends` baştan `cutStartS` ve sondan `cutEndS` kaldırır |
| startS | number | No | `0` | Range modu: saniye cinsinden başlangıç zamanı (minimum 0) |
| endS | number | Range mode | - | Range modu: saniye cinsinden bitiş zamanı (başlangıçtan sonra olmalıdır) |
| cutStartS | number | No | `0` | Ends modu: baştan kaldırılacak saniye |
| cutEndS | number | No | `0` | Ends modu: sondan kaldırılacak saniye |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Dosya ne kadar uzun olursa olsun ilk 2 saniyeyi ve son 3 saniyeyi kesin:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Süreler saniye cinsinden belirtilir ve ondalık içerebilir (ör. `10.5`).
- Range modunda `endS` değeri `startS` değerinden büyük olmalıdır. `endS` ses süresini aşarsa, dosya sonuna kadar kırpılır.
- Ends modunda `cutStartS` ve `cutEndS` değerlerinden en az biri sıfırın üzerinde olmalı ve ikisi birlikte en az 0,1 saniyelik ses bırakmalıdır. Kesim her dosyanın kendi uzunluğuna göre ölçüldüğünden, tek bir ayar farklı sürelere sahip bir grup dosyada çalışır.
- Çıktı genellikle giriş konteynerini korur. AAC girişi M4A olarak yazılır ve desteklenmeyen yalnızca-çözme girişleri MP3'e geri döner.
