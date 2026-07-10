---
description: "Napraw zarysowania, rozdarcia i uszkodzenia na starych zdjęciach za pomocą potoku AI do renowacji, poprawy twarzy i koloryzacji."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 317d701f3054
---

# Renowacja zdjęć {#photo-restoration}

Napraw zarysowania, rozdarcia i uszkodzenia na starych zdjęciach za pomocą wieloetapowego potoku AI. Łączy naprawę zarysowań, poprawę twarzy, odszumianie i opcjonalną koloryzację.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `photo-restoration` (4-5 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| scratchRemoval | boolean | Nie | `true` | Usuń zarysowania i uszkodzenia powierzchni |
| faceEnhancement | boolean | Nie | `true` | Popraw twarze na odrestaurowanym zdjęciu |
| fidelity | number | Nie | `0.7` | Wierność poprawy twarzy (0-1). Wyższe wartości mocniej zachowują oryginalne rysy |
| denoise | boolean | Nie | `true` | Zastosuj odszumianie do odrestaurowanego wyniku |
| denoiseStrength | number | Nie | `25` | Siła odszumiania (0-100) |
| colorize | boolean | Nie | `false` | Koloryzuj odrestaurowane zdjęcie (dla obrazów w skali szarości) |
| colorizeStrength | number | Nie | `85` | Intensywność koloryzacji (0-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

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
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `photo-restoration` (4-5 GB).
- Potok uruchamia wiele kroków AI kolejno: naprawa zarysowań, poprawa twarzy (GFPGAN), odszumianie i opcjonalnie koloryzacja.
- Tablica `steps` w wyniku pokazuje, które kroki przetwarzania zostały faktycznie wykonane.
- `scratchCoverage` to szacowany procent powierzchni obrazu, który miał uszkodzenia zarysowaniami.
- `fidelity` kontroluje, jak mocno twarze są poprawiane w stosunku do zachowania oryginalnego wyglądu. Niższe wartości dają bardziej agresywną poprawę; wyższe wartości są bardziej zachowawcze.
- Opcja `colorize` automatycznie wykrywa, czy obraz jest w skali szarości. Flaga `isGrayscale` w wyniku potwierdza to wykrycie.
- Format wyjściowy odpowiada automatycznie formatowi wejściowemu.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR, HDR i AVIF poprzez automatyczne dekodowanie.
