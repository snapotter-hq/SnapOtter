---
description: "Automatycznie wykrywaj i rozmywaj twarze na obrazach dzięki wykrywaniu twarzy AI, na potrzeby prywatności i anonimizacji zgodnej z RODO."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: c2fb28beda96
---

# Rozmycie twarzy / PII {#face-pii-blur}

Automatycznie wykrywaj i rozmywaj twarze na obrazach za pomocą wykrywania twarzy wspomaganego przez AI (MediaPipe).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modelu:** `face-detection` (200-300 MB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| blurRadius | number | Nie | `30` | Promień rozmycia stosowany do wykrytych twarzy (1-100) |
| sensitivity | number | Nie | `0.5` | Czułość wykrywania twarzy (0-1). Niższe wartości wykrywają mniej twarzy z wyższą pewnością |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Nie wykryto twarzy {#no-faces-detected}

Jeśli nie znaleziono żadnych twarzy, wynik zawiera ostrzeżenie:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowanego pakietu modelu `face-detection` (200-300 MB).
- Format wyjściowy automatycznie odpowiada formatowi wejściowemu.
- Tablica `faces` zawiera współrzędne ramki ograniczającej (x, y, szerokość, wysokość) dla każdej wykrytej twarzy.
- Zwiększ `sensitivity` (bliżej 1.0), aby wykryć więcej twarzy, w tym częściowo zasłonięte.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
