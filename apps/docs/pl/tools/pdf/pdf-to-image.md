---
description: "Przekształć strony PDF na wysokiej jakości obrazy."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: bf12d7df15c2
---

# PDF to Image {#pdf-to-image}

Przekształć strony PDF na wysokiej jakości obrazy rastrowe. Obsługuje wybór stron, wiele formatów wyjściowych, kontrolę DPI i tryby kolorów. Zawiera podtrasy info i preview do inspekcji plików PDF przed konwersją.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | Format wyjściowy: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | Rozdzielczość renderowania (36 do 2400). Wyższe DPI daje większe, bardziej szczegółowe obrazy. |
| quality | number | No | 85 | Jakość wyjściowa dla formatów stratnych (1 do 100) |
| colorMode | string | No | `"color"` | Tryb kolorów: `color`, `grayscale`, `bw` (próg czerni i bieli) |
| pages | string | No | `"all"` | Wybór stron: `all`, pojedyncza strona (`3`), zakres (`1-5`) lub rozdzielony przecinkami (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Zwraca liczbę stron pliku PDF bez renderowania żadnej strony.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Zwraca miniatury JPEG wszystkich stron w niskiej rozdzielczości jako adresy URL danych base64. Przydatne do budowania interfejsu wyboru stron.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- Używa MuPDF do renderowania PDF, zapewniając wysoką wierność wyniku z poprawnym renderowaniem czcionek i grafiki wektorowej.
- Pliki PDF chronione hasłem nie są obsługiwane i zwrócą błąd 400.
- Parametr `pages` obsługuje elastyczną składnię:
  - `"all"` lub `""` - wszystkie strony
  - `"3"` - pojedyncza strona
  - `"1-5"` - zakres stron (włącznie)
  - `"1,3,5-8"` - połączenie pojedynczych stron i zakresów
- Numery stron są liczone od 1. Podanie stron poza długością dokumentu zwraca błąd 400.
- Główny punkt końcowy zawsze generuje zarówno pliki do pobrania poszczególnych stron, jak i archiwum ZIP zawierające wszystkie wybrane strony.
- Punkt końcowy podglądu renderuje przy 72 DPI i skaluje do szerokości 300px, aby szybko generować miniatury. Miniatury są w formacie JPEG o jakości 60%.
- Punkt końcowy podglądu respektuje konfigurację serwera `MAX_PDF_PAGES`, ograniczając liczbę generowanych miniatur.
- W przypadku dużych dokumentów przy wysokim DPI czas przetwarzania rośnie proporcjonalnie. Rozważ użycie niższego DPI (150) do zastosowań internetowych i wyższego DPI (300-600) do druku.
