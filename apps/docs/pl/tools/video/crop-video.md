---
description: "Wykadrowanie obszaru z wideo."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 3a1fe88a7485
---

# Crop Video {#crop-video}

Kadruje prostokątny obszar z wideo, określając rozmiar i położenie tego obszaru.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| width | integer | Tak | - | Szerokość obszaru kadrowania w pikselach (minimum 16) |
| height | integer | Tak | - | Wysokość obszaru kadrowania w pikselach (minimum 16) |
| x | integer | Nie | `0` | Przesunięcie poziome od lewego górnego rogu |
| y | integer | Nie | `0` | Przesunięcie pionowe od lewego górnego rogu |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- Obszar kadrowania musi mieścić się w wymiarach wideo. Jeśli `x + width` lub `y + height` przekracza rozmiar źródła, żądanie zwraca błąd 400.
- Minimalny rozmiar kadrowania to 16x16 pikseli.
- Wymiary są zaokrąglane do liczb parzystych, zgodnie z wymaganiami większości kodeków wideo.
