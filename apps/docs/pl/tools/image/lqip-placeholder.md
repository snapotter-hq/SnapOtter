---
description: "Generuj maleńki symbol zastępczy obrazu niskiej jakości z identyfikatorem URI danych Base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 2fc223c7c2e9
---

# Symbol zastępczy LQIP {#lqip-placeholder}

Generuj maleńki symbol zastępczy obrazu niskiej jakości (LQIP) z obrazu źródłowego. Zwraca mały plik symbolu zastępczego wraz z identyfikatorem URI danych Base64, gotowym do użycia znacznikiem HTML `<img>` oraz fragmentem CSS `background-image` do natychmiastowego osadzenia.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| width | integer | Nie | `16` | Docelowa szerokość w pikselach (4-64) |
| blur | number | Nie | `2` | Promień rozmycia dla strategii rozmycia (0-20) |
| strategy | string | Nie | `"blur"` | Strategia symbolu zastępczego: `blur`, `pixelate` lub `solid` |
| format | string | Nie | `"webp"` | Format wyjściowy: `webp`, `png` lub `jpeg` |
| quality | integer | Nie | `50` | Jakość wyjściowa (1-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Uwagi {#notes}

- Pole `dataUri` zawiera kompletny identyfikator URI danych, gotowy do użycia w atrybutach `src` lub CSS bez żadnych dodatkowych żądań.
- Pola `html` i `css` dostarczają fragmenty do skopiowania i wklejenia w typowych zastosowaniach.
- Strategia `blur` tworzy miękką, rozmytą miniaturę. Strategia `pixelate` tworzy blokową mozaikę. Strategia `solid` zwraca pojedynczy uśredniony kolor.
- Typowe rozmiary symboli zastępczych to 200-500 bajtów, co czyni je odpowiednimi do osadzania bezpośrednio w HTML.
- Wysokość jest obliczana automatycznie, aby zachować proporcje obrazu źródłowego.
- Wejścia HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
