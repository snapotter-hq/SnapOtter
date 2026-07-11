---
description: "Obrót lub odbicie wideo."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 95bb05115cd2
---

# Rotate Video {#rotate-video}

Obraca wideo o 90, 180 lub 270 stopni lub odbija je poziomo albo pionowo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| transform | string | Tak | - | Transformacja do zastosowania: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Obrót o 90 stopni zgodnie z ruchem wskazówek zegara
- **ccw90** - Obrót o 90 stopni przeciwnie do ruchu wskazówek zegara
- **180** - Obrót o 180 stopni
- **hflip** - Odbicie poziome (lustrzane)
- **vflip** - Odbicie pionowe

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Obroty o 90 lub 270 stopni zamieniają miejscami szerokość i wysokość wideo.
- Operacje odbicia (hflip, vflip) nie zmieniają wymiarów wideo.
