---
description: "Odrestauruj i wyostrz rozmyte lub niskiej jakości twarze na obrazach za pomocą modeli AI GFPGAN i CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 0467760d4ebc
---

# Poprawa twarzy {#face-enhancement}

Odrestauruj i popraw twarze na obrazach za pomocą modeli AI (GFPGAN/CodeFormer).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Przetwarzanie:** asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiety modeli:** `upscale-enhance` (5-6 GB) oraz `face-detection` (200-300 MB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| model | string | Nie | `"auto"` | Model do użycia: `auto`, `gfpgan`, `codeformer` |
| strength | number | Nie | `0.8` | Siła poprawy (0-1). Wyższe wartości dają silniejszą poprawę |
| onlyCenterFace | boolean | Nie | `false` | Popraw tylko najbardziej centralną/wyeksponowaną twarz |
| sensitivity | number | Nie | `0.5` | Czułość wykrywania twarzy (0-1) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## Odpowiedź {#response}

### Odpowiedź początkowa (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Postęp (SSE pod `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Uwagi {#notes}

- Wymaga zarówno pakietu modelu `upscale-enhance` (5-6 GB), jak i pakietu modelu `face-detection` (200-300 MB).
- GFPGAN daje bardziej agresywną poprawę; CodeFormer lepiej zachowuje tożsamość. `auto` wybiera najlepszy model dla danego wejścia.
- Wynik ma zawsze format PNG dla maksymalnej jakości.
- Obok wyniku w pełnej rozdzielczości generowany jest podgląd WebP, aby przyspieszyć wyświetlanie w interfejsie.
- Parametr `strength` miesza poprawioną twarz z oryginałem. Użyj niższych wartości (0.3-0.5) dla subtelnych poprawek, wyższych (0.7-1.0) dla silniejszej restauracji.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
