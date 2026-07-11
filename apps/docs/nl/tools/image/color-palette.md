---
description: "Extraheer dominante kleuren uit een afbeelding als een kleurenpalet."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 18362082a94a
---

# Kleurenpalet {#color-palette}

Extraheer de dominante kleuren uit een afbeelding en geef ze terug als hex-kleurwaarden. Gebruikt gekwantiseerde frequentieanalyse om de meest prominente en visueel onderscheidende kleuren te identificeren.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| count | integer | Nee | `8` | Aantal te extraheren kleuren (2-16) |
| format | string | Nee | `"hex"` | Kleurformaat: `hex`, `rgb`, `hsl` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Antwoordvelden {#response-fields}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| filename | string | Opgeschoonde bestandsnaam |
| colors | array | Array van kleurstrings in het gevraagde formaat, gesorteerd op dominantie (meest voorkomend eerst) |
| hex | array | Array van hex-kleurstrings (altijd hex, ongeacht de `format`-instelling) |
| count | number | Aantal geëxtraheerde kleuren |

## Opmerkingen {#notes}

- Geeft tot `count` dominante kleuren terug (standaard 8, bereik 2-16), gesorteerd op frequentie (meest voorkomend eerst).
- De afbeelding wordt intern verkleind naar 100x100 pixels voor analyse, zodat het palet de algehele kleurverdeling weergeeft in plaats van kleine details.
- Kleuren worden geëxtraheerd met median-cut-kwantisatie, die pixelpopulaties recursief splitst langs het kanaal met het breedste bereik.
- Het alfakanaal wordt verwijderd vóór de analyse, zodat transparante gebieden niet worden meegenomen.
- Dit is een alleen-lezen eindpunt. Het produceert geen downloadbaar uitvoerbestand of `jobId`.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de analyse.
