---
description: "Başlangıç ve bitiş sürelerini belirterek bir ses dosyasından bir bölüm kesin."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 9dc1f95749c1
---

# Trim Audio {#trim-audio}

Saniye cinsinden başlangıç ve bitiş sürelerini belirterek bir ses dosyasından bir bölüm kesin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Bir ses dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Saniye cinsinden başlangıç zamanı (minimum 0) |
| endS | number | Yes | - | Saniye cinsinden bitiş zamanı (başlangıçtan sonra olmalıdır) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
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
- `endS` değeri `startS` değerinden büyük olmalıdır.
- `endS` ses süresini aşarsa, dosya sonuna kadar kırpılır.
- Çıktı genellikle giriş konteynerini korur. AAC girişi M4A olarak yazılır ve desteklenmeyen yalnızca-çözme girişleri MP3'e geri döner.
