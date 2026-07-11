---
description: "Usuwanie szumu i ziarna wspomagane AI z wielopoziomowymi opcjami jakości."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 0845acd65ae1
---

# Usuwanie szumu {#noise-removal}

Usuwanie szumu i ziarna wspomagane AI z wielopoziomowymi opcjami jakości, przy użyciu sidecara w Pythonie (model SCUNet).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `upscale-enhance` (5-6 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| tier | string | Nie | `"balanced"` | Poziom jakości: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Nie | `50` | Siła odszumiania (0-100) |
| detailPreservation | number | Nie | `50` | Jak wiele szczegółów zachować (0-100). Wyższe wartości zachowują więcej tekstury |
| colorNoise | number | Nie | `30` | Siła redukcji szumu barwnego (0-100) |
| format | string | Nie | `"original"` | Format wyjściowy: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nie | `90` | Jakość kodowania wyjścia (1-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `upscale-enhance` (5-6 GB).
- Poziomy jakości to kompromis między szybkością a jakością: `quick` jest najszybszy z podstawowym odszumianiem, `maximum` stosuje najbardziej dokładne podejście wieloprzebiegowe.
- Parametr `detailPreservation` ma kluczowe znaczenie dla obiektów o teksturze (tkanina, włosy, listowie). Wyższe wartości zapobiegają wygładzaniu drobnych szczegółów przez algorytm odszumiania.
- Gdy `format` ma wartość `"original"`, format wyjściowy odpowiada formatowi pliku wejściowego.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
