---
description: "Usuwaj niechciane obiekty z obrazów za pomocą inpaintingu AI (LaMa), kierując się maską obszaru do wymazania."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: d57ffcc5291b
---

# Wymazywanie obiektów {#object-eraser}

Usuwaj niechciane obiekty z obrazów za pomocą inpaintingu AI (model LaMa). Przyjmuje obraz oraz maskę wskazującą obszar do wymazania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Przetwarzanie:** asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modelu:** `object-eraser-colorize` (1-2 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu źródłowego (multipart) |
| mask | file | Tak | - | Obraz maski (biały = obszar do wymazania, czarny = zachowanie). Musi być przesłany z nazwą pola `mask` |
| format | string | Nie | `"auto"` | Format wyjściowy: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Nie | `95` | Jakość wyjściowa (1-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modelu `object-eraser-colorize` (1-2 GB).
- Maska musi mieć takie same wymiary jak obraz źródłowy. Białe piksele wskazują obszary do wymazania; AI wypełnia je wiarygodną treścią.
- Wykorzystuje LaMa (Large Mask Inpainting) do wysokiej jakości usuwania obiektów.
- W przypadku formatów wyjściowych, których nie można podejrzeć w przeglądarce, obok głównego wyniku generowany jest podgląd WebP.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
