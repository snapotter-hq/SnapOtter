---
description: "Bir videonun ses parçasını başka bir dosyayla değiştirin."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: d263697b05b2
---

# Replace Audio {#replace-audio}

Bir videonun ses parçasını bir ses dosyasıyla değiştirin. Hem bir video hem de bir ses dosyası yükleyin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Tam olarak iki dosya içeren multipart form data kabul eder: bir video dosyasını ardından bir ses dosyası.

## Parameters {#parameters}

Bu aracın ayar parametresi yoktur. Bir video dosyasını ve bir ses dosyasını iki `file` parçası olarak yükleyin.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Tam olarak iki dosya yüklenmelidir: ilki bir video, ikincisi bir ses dosyası olmalıdır.
- Ses dosyası videodan uzunsa, video süresine uyacak şekilde kısaltılır. Daha kısaysa, kalan video sessizce oynatılır.
- Video akışı yeniden kodlanmadan kopyalanır, bu yüzden video kalite kaybı olmaz.
