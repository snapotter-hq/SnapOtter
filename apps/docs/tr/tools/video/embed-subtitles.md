---
description: "Bir altyazı parçasını video konteynerine ekleyin."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: fbe7f931880d
---

# Embed Subtitles {#embed-subtitles}

Bir altyazı dosyasını, izleyicilerin açıp kapatabileceği yumuşak bir altyazı parçası olarak video konteynerine ekleyin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Bir video dosyası ve bir altyazı dosyası ile birlikte bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B dil kodu (3 küçük harf, örneğin `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- İki dosya yükleyin: ilki bir video, ikincisi bir altyazı dosyası (.srt, .vtt veya .ass) olmalıdır.
- Gömülü (yumuşak) altyazılar, izleyici tarafından medya oynatıcısında açılıp kapatılabilir. Kalıcı olarak görünür altyazılar için bunun yerine Burn Subtitles aracını kullanın.
- Dil kodu konteynerde meta veri olarak saklanır ve medya oynatıcıların altyazı parçasını etiketlemesine yardımcı olur.
