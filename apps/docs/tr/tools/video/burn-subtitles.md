---
description: "Altyazıları kalıcı olarak video karelerine işleyin."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 464f472fb718
---

# Burn Subtitles {#burn-subtitles}

Bir SRT, VTT veya ASS dosyasındaki altyazıları bir videonun her karesine kalıcı olarak işleyin (sabit kodlayın).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Bir video dosyası ve bir altyazı dosyası içeren multipart form data kabul eder. Bu asenkron bir uç noktadır; hemen `202 Accepted` döndürür ve ilerleme `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile aktarılır.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Piksel cinsinden altyazı yazı tipi boyutu (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- İki dosya yükleyin: ilki bir video, ikincisi bir altyazı dosyası (.srt, .vtt veya .ass) olmalıdır.
- İşlenen altyazılar videonun kalıcı bir parçasıdır ve izleyici tarafından kapatılamaz. Açılıp kapatılabilen altyazılar için bunun yerine Embed Subtitles aracını kullanın.
- İş tamamlanana kadar ilerleme güncellemeleri `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile sunulur.
