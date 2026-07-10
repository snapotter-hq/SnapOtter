---
description: "Bir ses dosyasından PNG görüntüsü olarak bir dalga formu görselleştirmesi oluşturun."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 4ce8f81111c7
---

# Waveform Image {#waveform-image}

Yapılandırılabilir boyutlar ve renkle, bir ses dosyasından PNG görüntüsü olarak bir dalga formu görselleştirmesi oluşturun.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Bir ses dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Piksel cinsinden görüntü genişliği (256 ile 3840 arası) |
| height | integer | No | `256` | Piksel cinsinden görüntü yüksekliği (64 ile 1080 arası) |
| color | string | No | `"#4f46e5"` | Dalga formu hex rengi (ör. `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- Giriş ses formatından bağımsız olarak çıktı her zaman bir PNG görüntüsüdür.
- Dalga formu saydam bir arka plan üzerine işlenir.
- Küçük resimler, sosyal medya önizlemeleri veya web sayfalarına gömme için kullanışlıdır.
