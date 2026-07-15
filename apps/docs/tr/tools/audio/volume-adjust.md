---
description: "Ses seviyesini desibel cinsinden sabit bir kazançla artırın veya azaltın."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 7103af0b532c
---

# Ses Seviyesini Ayarla {#volume-adjust}

Desibel cinsinden sabit bir kazanç uygulayarak bir ses dosyasının ses seviyesini artırın veya azaltın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Bir ses dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Desibel cinsinden ses ayarı (-30 ile 30 arası) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Pozitif değerler ses seviyesini artırır; negatif değerler azaltır.
- Büyük pozitif kazançlar kırpılmaya (clipping) neden olabilir. Ses seviyesi açısından güvenli dengeleme için normalize-audio kullanın.
- Çıktı genellikle giriş konteynerini korur. AAC girişi M4A olarak yazılır ve desteklenmeyen yalnızca-çözme girişleri MP3'e geri döner.
