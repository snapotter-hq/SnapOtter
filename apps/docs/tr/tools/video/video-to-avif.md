---
description: "Bir video klibini animasyonlu bir AVIF görüntüsüne dönüştürün."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 6a2900dea982
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Bir video klibini kare hızı, genişlik, kalite ve klip aralığı yapılandırılabilen animasyonlu bir AVIF görüntüsüne dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Çıktı kare hızı (1-30) |
| width | integer | No | `480` | Piksel cinsinden çıktı genişliği (64-1280). Yükseklik orantılı olarak ölçeklenir |
| startS | number | No | `0` | Klibin başladığı nokta, saniye cinsinden |
| durationS | number | No | `5` | Saniye cinsinden klip uzunluğu (en fazla 60) |
| quality | integer | No | `50` | AVIF kalitesi (1-100) |
| loop | boolean | No | `true` | Animasyonu döngüye al |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1 kodlaması GIF veya WebP'den yavaştır, bu yüzden bu araç genellikle `202` ile yanıt verir ve ilerlemesi SSE üzerinden `/api/v1/jobs/{jobId}/progress` adresinden izlenen bir iş döndürür. Kısa bir klip senkron bekleme süresi içinde bitip sonucu doğrudan döndürebilir:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Animasyonlu AVIF telifsizdir ve aynı görsel kalitede genellikle animasyonlu WebP veya GIF'ten küçüktür.
- Güncel tarayıcılar animasyonlu AVIF oynatır. Bazı masaüstü görüntü görüntüleyicileri yalnızca ilk kareyi gösterir.
- Ses parçası kaldırılır.
