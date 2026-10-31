---
description: "Usuwanie tła wspomagane AI z opcjonalnymi efektami (rozmycie, cień, gradient, niestandardowe tło)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: b609e1395985
---

# Usuwanie tła {#remove-background}

Usuwanie tła wspomagane AI z opcjonalnymi efektami (rozmycie, cień, gradient, niestandardowe tło).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `background-removal` (4-5 GB)

## Parametry {#parameters}

Etap 1 usuwa tło i zapisuje w pamięci podręcznej przezroczystą maskę PNG oraz oryginalny obraz. Zamiana tła, rozmycie, cień i konwersja formatu wyjściowego są stosowane w [Etapie 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (albo gdy `remove-background` działa jako krok potoku lub zadanie wsadowe); przekazanie tych pól do Etapu 1 zwraca 400.

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| model | string | Nie | - | Wariant modelu AI do użycia |
| edgeRefine | integer | Nie | - | Poziom wygładzania krawędzi (0-3) |
| decontaminate | boolean | Nie | - | Usuń przenikanie koloru z krawędzi |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
| backgroundImage | file | Wymagany, gdy `backgroundType` to `image` | - | Niestandardowy obraz tła |

#### Pola JSON ustawień {#settings-json-fields}

| Pole | Typ | Wymagane | Domyślnie | Opis |
|-------|------|----------|---------|-------------|
| jobId | string | Tak | - | ID zadania z Etapu 1 |
| filename | string | Tak | - | Oryginalna nazwa pliku z Etapu 1 |
| backgroundType | string | Nie | `"transparent"` | Jedno z: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Wymagany, gdy `backgroundType` to `color` | - | Kolor hex: `#RRGGBB` lub `#RGB` (`#` jest opcjonalny) |
| gradientColor1 | string | Wymagany, gdy `backgroundType` to `gradient` | - | Pierwszy kolor gradientu, hex jak w `backgroundColor` |
| gradientColor2 | string | Wymagany, gdy `backgroundType` to `gradient` | - | Drugi kolor gradientu, hex jak w `backgroundColor` |
| gradientAngle | number | Nie | - | Kąt gradientu w stopniach |
| blurEnabled | boolean | Nie | - | Rozmyj oryginalne tło za obiektem (`backgroundType: "blur"` to implikuje) |
| blurIntensity | number | Nie | - | Intensywność rozmycia (0-100) |
| shadowEnabled | boolean | Nie | - | Włącz cień pod obiektem |
| shadowOpacity | number | Nie | `35` | Krycie cienia (0-100), używane, gdy `shadowEnabled` ma wartość true |
| outputFormat | string | Nie | `"png"` | Format wyjściowy: `png`, `webp` lub `avif` |

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

#### Błąd: Usuwanie tła wygasło (410) {#error-background-removal-expired-410}

Punkt końcowy efektów działa na masce i oryginale, które Etap 1 zapisał dla `jobId`. Zapisane wyniki są po pewnym czasie czyszczone, więc jeśli między oboma wywołaniami minie zbyt dużo czasu, ich nie ma. Uruchom Etap 1 ponownie na tym samym obrazie i użyj zwróconego `jobId`.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

`jobId` lub `filename`, które nie wskazują zapisanego pliku (separator ścieżki, `..`, pusty ciąg), zwraca 400.

## Uwagi {#notes}

- Wymaga zainstalowania pakietu modeli `background-removal` (4-5 GB).
- Etap 1 zapisuje w pamięci podręcznej przezroczystą maskę i oryginalny obraz, dzięki czemu Etap 2 (efekty) może natychmiast zastosować różne tła bez ponownego uruchamiania modelu AI.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
- Obrót EXIF jest automatycznie korygowany przed przetwarzaniem.
