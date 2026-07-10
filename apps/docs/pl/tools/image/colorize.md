---
description: "Automatycznie koloryzuj czarno-białe lub szare zdjęcia za pomocą modelu AI DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 64c9b2a242d3
---

# Koloryzacja AI {#ai-colorization}

Zamień czarno-białe lub szare zdjęcia na pełnokolorowe przy użyciu AI (model DDColor z rezerwowym OpenCV DNN).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Przetwarzanie:** asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modelu:** `object-eraser-colorize` (1-2 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| intensity | number | Nie | `1.0` | Intensywność koloru (0-1). Niższe wartości dają subtelniejszą koloryzację |
| model | string | Nie | `"auto"` | Model do użycia: `auto`, `ddcolor`, `opencv` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modelu `object-eraser-colorize` (1-2 GB).
- DDColor daje wyniki wyższej jakości, ale jest wolniejszy; OpenCV DNN jest szybszy przy nieco niższej jakości. `auto` używa DDColor, gdy jest dostępny, z rezerwowym OpenCV.
- Parametr `intensity` miesza oryginalny obraz w skali szarości z wynikiem koloryzacji AI. Użyj wartości 1.0 dla pełnego koloru, niższych wartości dla częściowo odbarwionego, vintage'owego wyglądu.
- Format wyjściowy jest automatycznie dopasowywany do formatu wejściowego.
- W przypadku formatów wyjściowych, których nie można podejrzeć w przeglądarce, obok głównego wyniku generowany jest podgląd WebP.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
