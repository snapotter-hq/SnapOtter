---
description: "Konwertuj pliki SVG do PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF lub JXL w niestandardowej rozdzielczości i DPI, z obsługą przetwarzania wsadowego."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: f2c4302cb6d9
---

# SVG do rastra {#svg-to-raster}

Konwertuj pliki SVG do rastrowych formatów obrazu (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF lub JXL) w niestandardowej rozdzielczości i DPI. Obsługuje również konwersję wsadową wielu plików SVG.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| width | integer | Nie | - | Docelowa szerokość w pikselach (1 do 65536). Zachowuje proporcje, jeśli ustawiono tylko jeden wymiar. |
| height | integer | Nie | - | Docelowa wysokość w pikselach (1 do 65536). Zachowuje proporcje, jeśli ustawiono tylko jeden wymiar. |
| dpi | integer | Nie | 300 | DPI renderowania, kontroluje bazową gęstość rasteryzacji (36 do 2400) |
| quality | number | Nie | 90 | Jakość wyjściowa dla formatów stratnych (1 do 100) |
| backgroundColor | string | Nie | `"#00000000"` | Kolor tła w formacie hex (6 lub 8 znaków, wersja 8-znakowa zawiera kanał alfa) |
| outputFormat | string | Nie | `"png"` | Format wyjściowy: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Punkt końcowy przetwarzania wsadowego {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Konwertuj wiele plików SVG w jednym żądaniu. Zwraca archiwum ZIP.

### Dodatkowe parametry wsadowe {#additional-batch-parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Nie | - | Opcjonalny identyfikator zadania dostarczony przez klienta do śledzenia postępu (maks. 128 znaków) |

### Przykładowe żądanie wsadowe {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Odpowiedź wsadowa {#batch-response}

Punkt końcowy przetwarzania wsadowego przesyła strumieniowo plik ZIP bezpośrednio z nagłówkami:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Uwagi {#notes}

- Przyjmuje wyłącznie pliki SVG i SVGZ (waliduje zawartość, nie tylko rozszerzenie). SVGZ jest automatycznie dekompresowany.
- Zawartość SVG jest oczyszczana przed renderowaniem, aby zapobiec atakom XSS i ładowaniu zasobów zewnętrznych.
- Ustawienie `dpi` kontroluje gęstość, z jaką SVG jest rasteryzowany. Wyższe DPI daje większe wymiary pikselowe z tego samego widoku SVG.
- Gdy podane są jednocześnie `width` i `height`, obraz jest skalowany za pomocą `fit: inside` (zachowuje proporcje w granicach).
- `previewUrl` jest dołączany do odpowiedzi dla formatów, których przeglądarki nie mogą natywnie wyświetlić (TIFF, HEIF). Podgląd to miniatura WebP o rozmiarze 1200px.
- Domyślne tło `#00000000` jest całkowicie przezroczyste. Ustaw `#FFFFFF` dla białego tła (przydatne przy wyjściu JPEG, który nie obsługuje przezroczystości).
- Przetwarzanie wsadowe respektuje konfigurację serwera `MAX_BATCH_SIZE` i wykorzystuje współbieżnych pracowników dla wydajności.
- Postęp operacji wsadowych można śledzić przez SSE pod `/api/v1/jobs/:jobId/progress`.
