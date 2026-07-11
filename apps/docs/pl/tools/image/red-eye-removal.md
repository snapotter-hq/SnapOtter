---
description: "Wykrywanie i korekcja efektu czerwonych oczu spowodowanego lampą błyskową, wspomagane AI."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 1f5d29f39bb0
---

# Usuwanie efektu czerwonych oczu {#red-eye-removal}

Wykrywanie i korekcja efektu czerwonych oczu spowodowanego lampą błyskową, wspomagane AI.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `face-detection` (200-300 MB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| sensitivity | number | Nie | `50` | Czułość wykrywania czerwonych oczu (0-100). Wyższe wartości wykrywają subtelniejszy efekt |
| strength | number | Nie | `70` | Siła korekcji (0-100). Jak agresywnie neutralizować czerwień |
| format | string | Nie | - | Format wyjściowy (opcjonalne nadpisanie) |
| quality | number | Nie | `90` | Jakość wyjścia (1-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `face-detection` (200-300 MB).
- Najpierw wykrywa twarze, następnie lokalizuje obszary oczu w każdej twarzy, a na końcu identyfikuje i koryguje piksele czerwonych oczu.
- Licznik `facesDetected` wskazuje, ile twarzy znaleziono; `eyesCorrected` to łączna liczba pojedynczych oczu, w których skorygowano efekt czerwonych oczu.
- Wyjściem jest zawsze PNG dla maksymalnego zachowania jakości.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
