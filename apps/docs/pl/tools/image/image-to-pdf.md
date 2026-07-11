---
description: "Połącz jeden lub więcej obrazów w dokument PDF z opcjami rozmiaru strony, orientacji i docelowego rozmiaru pliku."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 990d14b7fce3
---

# Obraz na PDF {#image-to-pdf}

Połącz jeden lub więcej obrazów w dokument PDF. Obsługuje wiele rozmiarów stron, orientacji, marginesów oraz opcjonalne ustawienie docelowego rozmiaru pliku poprzez regulację jakości.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Przyjmuje dane formularza multipart z jednym lub większą liczbą plików obrazów oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| pageSize | string | Nie | `"A4"` | Rozmiar strony: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Nie | `"portrait"` | Orientacja strony: `portrait` lub `landscape` |
| margin | number | Nie | `20` | Margines strony w punktach (0-500) |
| targetSize | object | Nie | - | Ograniczenie docelowego rozmiaru pliku (patrz niżej) |
| collate | boolean | Nie | `true` | Połącz wszystkie obrazy w jeden PDF. Jeśli `false`, tworzy jeden PDF na obraz. |

### Obiekt targetSize {#target-size-object}

| Pole | Typ | Wymagany | Opis |
|-------|------|----------|-------------|
| value | number | Tak | Wartość docelowego rozmiaru |
| unit | string | Tak | Jednostka: `KB` lub `MB` |

Minimalny docelowy rozmiar to 50 KB.

## Przykładowe żądanie {#example-request}

Podstawowy PDF z wieloma obrazami:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Z docelowym rozmiarem pliku:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Jeden PDF na obraz:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Przykładowa odpowiedź (połączona) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Przykładowa odpowiedź (niepołączona) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Przykładowa odpowiedź (z docelowym rozmiarem) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Uwagi {#notes}

- Obrazy są wyśrodkowane na stronie i skalowane tak, aby zmieściły się w marginesach, zachowując proporcje. Obrazy nigdy nie są powiększane.
- Gdy `collate` to `false`, każdy obraz staje się osobnym plikiem PDF, a plikiem do pobrania jest archiwum ZIP zawierające wszystkie pliki PDF.
- Funkcja docelowego rozmiaru używa iteracyjnego wyszukiwania binarnego po poziomach jakości JPEG (10-95), aby znaleźć najlepszą jakość mieszczącą się w budżecie.
- Przezroczyste obrazy są spłaszczane do bieli przed osadzeniem w PDF.
- Obsługiwane formaty wejściowe: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG i inne.
- Orientacja EXIF jest automatycznie stosowana przed osadzeniem.
