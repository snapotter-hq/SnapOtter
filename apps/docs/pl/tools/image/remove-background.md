---
description: "Usuwanie tła wspomagane AI z opcjonalnymi efektami (rozmycie, cień, gradient, niestandardowe tło)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: c66a3291299a
---

# Usuwanie tła {#remove-background}

Usuwanie tła wspomagane AI z opcjonalnymi efektami (rozmycie, cień, gradient, niestandardowe tło).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `background-removal` (4-5 GB)

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| model | string | Nie | - | Wariant modelu AI do użycia |
| backgroundType | string | Nie | `"transparent"` | Jedno z: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Nie | - | Kolor hex dla jednolitego tła |
| gradientColor1 | string | Nie | - | Pierwszy kolor gradientu |
| gradientColor2 | string | Nie | - | Drugi kolor gradientu |
| gradientAngle | number | Nie | - | Kąt gradientu w stopniach |
| blurEnabled | boolean | Nie | - | Włącz efekt rozmycia tła |
| blurIntensity | number | Nie | - | Intensywność rozmycia (0-100) |
| shadowEnabled | boolean | Nie | - | Włącz cień pod obiektem |
| shadowOpacity | number | Nie | - | Krycie cienia (0-100) |
| outputFormat | string | Nie | - | Format wyjściowy: `png`, `webp` lub `avif` |
| edgeRefine | integer | Nie | - | Poziom wygładzania krawędzi (0-3) |
| decontaminate | boolean | Nie | - | Usuń przenikanie koloru z krawędzi |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Punkt końcowy efektów (Etap 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Ponownie stosuje efekty tła bez ponownego uruchamiania modelu AI. Korzysta z zapisanej w pamięci podręcznej maski i oryginału z Etapu 1.

### Parametry {#parameters-1}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| settings | JSON | Tak | - | JSON z ustawieniami efektów (patrz poniżej) |
| backgroundImage | file | Nie | - | Niestandardowy obraz tła (gdy backgroundType to `image`) |

#### Pola JSON ustawień {#settings-json-fields}

| Pole | Typ | Wymagane | Opis |
|-------|------|----------|-------------|
| jobId | string | Tak | ID zadania z Etapu 1 |
| filename | string | Tak | Oryginalna nazwa pliku z Etapu 1 |
| backgroundType | string | Nie | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Nie | Kolor hex dla jednolitego tła |
| gradientColor1 | string | Nie | Pierwszy kolor gradientu |
| gradientColor2 | string | Nie | Drugi kolor gradientu |
| gradientAngle | number | Nie | Kąt gradientu w stopniach |
| blurEnabled | boolean | Nie | Włącz rozmycie tła |
| blurIntensity | number | Nie | Intensywność rozmycia (0-100) |
| shadowEnabled | boolean | Nie | Włącz cień |
| shadowOpacity | number | Nie | Krycie cienia (0-100) |
| outputFormat | string | Nie | `png`, `webp` lub `avif` |

### Przykładowe żądanie {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Odpowiedź (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `background-removal` (4-5 GB).
- Etap 1 zapisuje w pamięci podręcznej przezroczystą maskę i oryginalny obraz, dzięki czemu Etap 2 (efekty) może natychmiast zastosować różne tła bez ponownego uruchamiania modelu AI.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
- Obrót EXIF jest automatycznie korygowany przed przetwarzaniem.
