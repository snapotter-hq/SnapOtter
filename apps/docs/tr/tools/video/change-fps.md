---
description: "Bir videonun kare hızını değiştirin."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 7c8f64ebc7f6
---

# Change FPS {#change-fps}

Bir videonun kare hızını 1 ile 120 fps arasında bir hedef değere değiştirin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Hedef kare hızı (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Kare hızını düşürmek kareleri atar ve dosya boyutunu azaltır. Artırmak, boşluğu doldurmak için kareleri çoğaltır ancak gerçek hareket ayrıntısı eklemez.
- Yaygın hedef değerler: 24 (sinema), 30 (web/yayın), 60 (akıcı oynatma).
- Ses parçası orijinal örnekleme hızında korunur.
