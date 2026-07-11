---
description: "Powiększaj obrazy od 2x do 4x za pomocą superrozdzielczości AI Real-ESRGAN, zachowując drobne detale."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: e1778b4b5ecf
---

# Powiększanie obrazu {#image-upscaling}

Ulepszanie za pomocą superrozdzielczości AI przy użyciu Real-ESRGAN. Powiększa obrazy 2x-4x, zachowując detale.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `upscale-enhance` (5-6 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| scale | number | Nie | `2` | Współczynnik powiększenia (np. 2, 3, 4) |
| model | string | Nie | `"auto"` | Model do użycia (np. `auto`, konkretne nazwy modeli) |
| faceEnhance | boolean | Nie | `false` | Zastosuj poprawę twarzy podczas powiększania |
| denoise | number | Nie | `0` | Siła odszumiania (0 = wyłączone) |
| format | string | Nie | `"auto"` | Format wyjściowy: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Nie | `95` | Jakość wyjściowa (1-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Odpowiedź {#response}

### Wstępna odpowiedź (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Postęp (SSE pod `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `upscale-enhance` (5-6 GB).
- Używa Real-ESRGAN, gdy jest dostępny; wraca do interpolacji Lanczosa, jeśli model AI jest niedostępny.
- Opcja `faceEnhance` stosuje odtwarzanie twarzy GFPGAN podczas powiększania dla lepszej jakości twarzy.
- Dla formatów wyjściowych, których przeglądarka nie może wyświetlić (HEIC, JXL, TIFF), generowany jest podgląd WebP obok głównego wyniku.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
