---
description: "Dodawaj stylizowane nakładki tekstowe z cieniami i tłem w formie prostokąta."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 76614f24d297
---

# Nakładka tekstowa {#text-overlay}

Dodawaj stylizowany tekst do obrazów z opcjonalnym cieniem i półprzezroczystym prostokątnym tłem. Odpowiednie do tytułów, podpisów lub adnotacji na zdjęciach.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| text | string | Tak | - | Tekst do nałożenia (1 do 500 znaków) |
| fontSize | number | Nie | `48` | Rozmiar czcionki w pikselach (8 do 200) |
| color | string | Nie | `"#FFFFFF"` | Kolor tekstu w formacie hex (`#RRGGBB`) |
| position | string | Nie | `"bottom"` | Umieszczenie w pionie: `top`, `center`, `bottom` |
| backgroundBox | boolean | Nie | `false` | Pokaż półprzezroczysty prostokąt tła za tekstem |
| backgroundColor | string | Nie | `"#000000"` | Kolor prostokąta tła w formacie hex (`#RRGGBB`) |
| shadow | boolean | Nie | `true` | Zastosuj cień za tekstem |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Z prostokątem tła:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Uwagi {#notes}

- Tekst jest zawsze wyśrodkowany poziomo w obrębie obrazu.
- Cień używa przesunięcia 2px z rozmyciem 3px przy 70% nieprzezroczystości czerni.
- Prostokąt tła obejmuje całą szerokość obrazu przy 70% nieprzezroczystości, a jego wysokość jest proporcjonalna do rozmiaru czcionki (1.8x).
- Tekst jest renderowany przez kompozyt SVG, więc używana jest domyślna bezszeryfowa czcionka systemu.
- Znaki specjalne XML w tekście są bezpiecznie escapowane.
- Format wyjściowy odpowiada formatowi wejściowemu. Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
