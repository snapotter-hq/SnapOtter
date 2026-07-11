---
description: "Sese içeri ve dışarı solma efektleri ekleyin."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: c5f9238bb1dd
---

# Fade Audio {#fade-audio}

Bir ses dosyasının başına ve sonuna içeri solma (fade-in) ve dışarı solma (fade-out) efektleri ekleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Hayır | `1` | Saniye cinsinden içeri solma süresi (0 ile 30 arası) |
| fadeOutS | number | Hayır | `1` | Saniye cinsinden dışarı solma süresi (0 ile 30 arası) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notlar {#notes}

- O solma yönünü atlamak için değerlerden birini `0` olarak ayarlayın. En az biri 0'dan büyük olmalıdır.
- Solma süresi, ses uzunluğunu aşarsa ona kırpılır.
- Çıktı genellikle girdi konteynerini korur. AAC girdisi M4A olarak yazılır ve desteklenmeyen yalnızca-çözümleme (decode-only) girdileri MP3'e geri döner.
