---
description: "Genereer een RGB-histogramgrafiek met statistieken per kanaal vanuit een afbeelding."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 262f631e7fd5
---

# Histogram {#histogram}

Genereer een RGB-histogramgrafiek vanuit een afbeelding. Retourneert een PNG-histogramafbeelding samen met statistieken per kanaal en ruwe histogramgegevens met 256 bins in de antwoord-JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| scale | string | Nee | `"linear"` | Schaal van de Y-as: `linear` of `log` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Voorbeeldantwoord {#example-response}

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

## Opmerkingen {#notes}

- Het veld `downloadUrl` verwijst naar een gerenderde PNG-histogramgrafiek die de R-, G-, B- en luminantieverdelingen toont.
- `bins` bevat ruwe arrays met 256 waarden voor elk kanaal (rood, groen, blauw, luminantie), geschikt voor het renderen van aangepaste visualisaties.
- `stats` geeft het gemiddelde, de mediaan en de standaarddeviatie per kanaal.
- `mean` en `max` zijn achterwaarts compatibele afkortingsvelden.
- Gebruik de schaal `log` wanneer het histogram wordt gedomineerd door enkele pieken en je detail in de lagere bins wilt zien.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de analyse.
