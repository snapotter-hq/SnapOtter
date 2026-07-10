---
description: "Zastąp określony kolor na obrazie innym kolorem lub uczyń go przezroczystym."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 738c3a5148df
---

# Zamiana i inwersja koloru {#replace-invert-color}

Zastąp piksele pasujące do koloru źródłowego kolorem docelowym lub uczyń je przezroczystymi. Używa odległości euklidesowej w przestrzeni RGB z konfigurowalną tolerancją dla płynnego przejścia na granicach kolorów.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Nie | `"#FF0000"` | Kolor hex do znalezienia (format: `#RRGGBB`) |
| targetColor | string | Nie | `"#00FF00"` | Kolor hex, na który zamienić (format: `#RRGGBB`) |
| makeTransparent | boolean | Nie | `false` | Uczyń pasujące piksele przezroczystymi zamiast zamieniać na kolor docelowy |
| tolerance | number | Nie | `30` | Tolerancja dopasowania koloru (0 do 255). Wyższe wartości dopasowują szerszy zakres podobnych kolorów |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Uczyń zielone tło przezroczystym:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Uwagi {#notes}

- Dopasowanie koloru używa odległości euklidesowej w przestrzeni RGB, skalowanej przez `tolerance * sqrt(3)`.
- Mieszanie przy zamianie jest proporcjonalne do odległości koloru: piksele bliższe kolorowi źródłowemu otrzymują więcej koloru docelowego, tworząc płynne przejścia.
- Gdy `makeTransparent` ma wartość `true`, wynik jest wymuszany na PNG (lub WebP/AVIF), jeśli format wejściowy nie obsługuje kanałów alfa (np. JPEG).
- Tolerancja 0 dopasowuje tylko dokładny kolor źródłowy. Wyższe wartości (50+) dopasują szerszy zakres podobnych odcieni.
- Format wyjściowy odpowiada formatowi wejściowemu, chyba że potrzebna jest przezroczystość, a format wejściowy nie obsługuje kanału alfa.
