---
description: "Symuluj, jak obrazy wyglądają dla osób z różnymi rodzajami zaburzeń widzenia barw."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 14491fd69cec
---

# Symulacja daltonizmu {#color-blindness-simulation}

Symuluj zaburzenie widzenia barw (CVD), aby zobaczyć, jak obrazy wyglądają dla osób z różnymi rodzajami daltonizmu. Przydatne do testowania dostępności projektów, wykresów i interfejsów użytkownika.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| simulationType | string | Nie | `"deuteranomaly"` | Rodzaj zaburzenia widzenia barw do zasymulowania |

### Rodzaje symulacji {#simulation-types}

| Wartość | Stan | Opis |
|-------|-----------|-------------|
| `protanopia` | Ślepota na czerwień | Całkowity brak czopków czerwieni |
| `deuteranopia` | Ślepota na zieleń | Całkowity brak czopków zieleni |
| `tritanopia` | Ślepota na błękit | Całkowity brak czopków błękitu |
| `protanomaly` | Osłabione widzenie czerwieni | Obniżona czułość czopków czerwieni |
| `deuteranomaly` | Osłabione widzenie zieleni | Obniżona czułość czopków zieleni (najczęstsze) |
| `tritanomaly` | Osłabione widzenie błękitu | Obniżona czułość czopków błękitu |
| `achromatopsia` | Całkowita ślepota barw | Całkowity brak widzenia barw |
| `blueConeMonochromacy` | Tylko czopki błękitu | Działają wyłącznie czopki błękitu |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Uwagi {#notes}

- Deuteranomalia (osłabione widzenie zieleni) jest ustawieniem domyślnym, ponieważ to najczęstsza postać zaburzenia widzenia barw, dotykająca około 6% mężczyzn.
- Symulacja wykorzystuje macierze transformacji kolorów, które modelują, jak obniżone lub nieobecne fotoreceptory czopkowe zmieniają postrzegane barwy.
- To narzędzie jest nieniszczące i generuje jedynie podgląd. Nie modyfikuje oryginalnego obrazu na potrzeby dostępności.
- Format wyjściowy odpowiada formatowi wejściowemu. Pliki wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetworzeniem.
