---
description: "Konwersja klipu wideo na animowany obraz AVIF."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 260bd5570144
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Konwersja klipu wideo na animowany obraz AVIF z konfigurowalną liczbą klatek na sekundę, szerokością, jakością i zakresem klipu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | Nie | `12` | Wyjściowa liczba klatek na sekundę (1-30) |
| width | integer | Nie | `480` | Szerokość wyjściowa w pikselach (64-1280). Wysokość skaluje się proporcjonalnie |
| startS | number | Nie | `0` | Początek klipu w sekundach |
| durationS | number | Nie | `5` | Długość klipu w sekundach (do 60) |
| quality | integer | Nie | `50` | Jakość AVIF (1-100) |
| loop | boolean | Nie | `true` | Zapętlenie animacji |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

Kodowanie AV1 jest wolniejsze niż GIF czy WebP, więc to narzędzie zwykle odpowiada `202` z zadaniem, którego postęp śledzi się przez SSE pod `/api/v1/jobs/{jobId}/progress`. Krótki klip może skończyć się w oknie synchronicznym i od razu zwrócić wynik:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- Animowany AVIF jest wolny od opłat licencyjnych i przy tej samej jakości wizualnej zwykle mniejszy niż animowany WebP lub GIF.
- Obecne przeglądarki odtwarzają animowany AVIF. Niektóre desktopowe przeglądarki obrazów pokazują tylko pierwszą klatkę.
- Ścieżka audio jest usuwana.
