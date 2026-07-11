---
description: "Generuj wykres histogramu RGB ze statystykami dla poszczególnych kanałów z obrazu."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 14ab115a148f
---

# Histogram {#histogram}

Generuj wykres histogramu RGB z obrazu. Zwraca obraz histogramu w formacie PNG wraz ze statystykami dla poszczególnych kanałów oraz surowymi danymi histogramu z 256 przedziałami w odpowiedzi JSON.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| scale | string | Nie | `"linear"` | Skala osi Y: `linear` lub `log` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Uwagi {#notes}

- `downloadUrl` wskazuje na wyrenderowany wykres histogramu PNG pokazujący rozkłady R, G, B i luminancji.
- `bins` zawiera surowe tablice 256 wartości dla każdego kanału (czerwony, zielony, niebieski, luminancja), przydatne do renderowania niestandardowych wizualizacji.
- `stats` dostarcza średnią, medianę i odchylenie standardowe dla każdego kanału.
- `mean` i `max` to zgodne wstecznie pola skrócone.
- Użyj skali `log`, gdy histogram jest zdominowany przez kilka szczytów, a chcesz zobaczyć szczegóły w niższych przedziałach.
- Wejścia HEIC, RAW, PSD i SVG są automatycznie dekodowane przed analizą.
