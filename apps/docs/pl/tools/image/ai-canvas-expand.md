---
description: "Rozszerz płótno obrazu za pomocą AI outpaintingu, powiększając je w dowolnym kierunku i wypełniając nowe obszary tak, aby pasowały do oryginału."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 2fecd7b7e469
---

# Rozszerzanie płótna AI {#ai-canvas-expand}

Rozszerz płótno obrazu za pomocą wypełniania wspomaganego przez AI (outpainting). Powiększa obraz w dowolnym kierunku i wypełnia nowe obszary treścią wygenerowaną przez AI, która pasuje do istniejącego obrazu.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modelu:** `object-eraser-colorize` (1-2 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| extendTop | integer | Nie | `0` | Piksele do rozszerzenia u góry |
| extendRight | integer | Nie | `0` | Piksele do rozszerzenia po prawej |
| extendBottom | integer | Nie | `0` | Piksele do rozszerzenia u dołu |
| extendLeft | integer | Nie | `0` | Piksele do rozszerzenia po lewej |
| tier | string | Nie | `"balanced"` | Poziom jakości: `fast`, `balanced`, `high` |
| format | string | Nie | `"auto"` | Format wyjściowy: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Nie | `95` | Jakość wyjściowa (1-100) |

Co najmniej jeden kierunek rozszerzenia musi być większy niż 0.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Uwagi {#notes}

- Wymaga zainstalowanego pakietu modelu `object-eraser-colorize` (1-2 GB).
- Używa outpaintingu opartego na LaMa do generowania treści dla rozszerzonych obszarów.
- Parametr `tier` wymienia szybkość na jakość: `fast` daje wyniki szybko, z możliwymi artefaktami, `high` trwa dłużej, ale daje gładsze, bardziej spójne wypełnienia.
- Wartości rozszerzenia są w pikselach. Ostateczne wymiary obrazu wyniosą: szerokość oryginału + extendLeft + extendRight na wysokość oryginału + extendTop + extendBottom.
- Dla formatów wyjściowych niemożliwych do podglądu w przeglądarce (HEIC, JXL, TIFF) obok głównego wyniku generowany jest podgląd WebP.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
