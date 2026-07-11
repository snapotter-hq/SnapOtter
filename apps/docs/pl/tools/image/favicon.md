---
description: "Generuj wszystkie standardowe rozmiary ikon favicon i ikon aplikacji z obrazu źródłowego."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: ce28a5b01308
---

# Generator favicon {#favicon-generator}

Wygeneruj kompletny zestaw plików favicon i ikon aplikacji z obrazu źródłowego. Tworzy wszystkie standardowe rozmiary potrzebne przeglądarkom, urządzeniom Apple i Android, wraz z manifestem web oraz fragmentem HTML.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Przyjmuje dane formularza multipart z jednym lub większą liczbą plików obrazów oraz opcjonalnym polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| background | string | Nie | - | Kolor tła w formacie hex (np. `"#ffffff"`). Gdy ustawiony, ikona jest spłaszczana na tym kolorze. |
| padding | integer | Nie | `0` | Procent odstępu wokół zawartości ikony (0 do 40) |
| radius | integer | Nie | `0` | Procent promienia zaokrąglenia narożników dla zaokrąglonych ikon (0 do 50) |
| sizes | integer[] | Nie | - | Ogranicz wynik do konkretnych rozmiarów w pikselach (np. `[16, 32, 180]`). Pomiń, aby wygenerować wszystkie standardowe rozmiary. |
| themeColor | string | Nie | `"#ffffff"` | Kolor motywu w formacie hex dla manifestu web |

## Generowane pliki {#generated-files}

Dla każdego obrazu wejściowego tworzone są następujące pliki:

| Plik | Rozmiar | Przeznaczenie |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Ikona karty przeglądarki |
| `favicon-32x32.png` | 32x32 | Ikona karty przeglądarki (HiDPI) |
| `favicon-48x48.png` | 48x48 | Skrót na pulpicie |
| `apple-touch-icon.png` | 180x180 | Ekran główny iOS |
| `android-chrome-192x192.png` | 192x192 | Ekran główny Android |
| `android-chrome-512x512.png` | 512x512 | Ekran powitalny Android |
| `favicon.ico` | 32x32 | Starszy format ICO |
| `manifest.json` | - | Manifest aplikacji web z odwołaniami do ikon |
| `favicon-snippet.html` | - | Gotowe do użycia znaczniki link HTML |

## Przykładowe żądanie {#example-request}

Pojedynczy obraz źródłowy z zaokrąglonymi narożnikami i odstępem:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Wiele obrazów źródłowych (każdy otrzymuje własny zestaw w podfolderze):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Przykładowa odpowiedź {#example-response}

Odpowiedzią jest plik ZIP przesyłany strumieniowo bezpośrednio. Nagłówki odpowiedzi to:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Dołączony fragment HTML {#html-snippet-included}

Plik ZIP zawiera plik `favicon-snippet.html`, który możesz wkleić do swojego HTML `<head>`:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Uwagi {#notes}

- Obrazy źródłowe są skalowane w trybie dopasowania `cover`, co oznacza, że są przycinane, aby wypełnić każdy kwadratowy rozmiar. Dla najlepszych rezultatów użyj kwadratowego obrazu źródłowego.
- Gdy przesłanych jest wiele plików, każdy otrzymuje własny podfolder w pliku ZIP (nazwany według pliku źródłowego).
- W przypadku przesłania pojedynczego pliku wszystkie wyniki znajdują się w katalogu głównym pliku ZIP bez podfolderu.
- Pliki, które nie przejdą walidacji lub dekodowania, są pomijane, a do pliku ZIP dołączany jest `skipped-files.txt` wyjaśniający problemy.
- Obsługiwane formaty wejściowe: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD i inne.
- Orientacja EXIF jest automatycznie stosowana przed skalowaniem.
