---
description: "Snijd een afbeelding bij tot een gecentreerde cirkel met transparante hoeken."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 96e61f0578d1
---

# Cirkelvormig bijsnijden {#circle-crop}

Snijd een afbeelding bij tot een gecentreerde cirkel met transparante hoeken. Ondersteunt instelbare zoom, verschuiving, rand en uitvoergrootte.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| zoom | number | Nee | `1` | Zoomfactor (1-5); hogere waarden snijden strakker bij |
| offsetX | number | Nee | `0.5` | Horizontale middenpositie (0-1) |
| offsetY | number | Nee | `0.5` | Verticale middenpositie (0-1) |
| borderWidth | integer | Nee | `0` | Randbreedte in pixels (0-200) |
| borderColor | string | Nee | `"#ffffff"` | Hex-kleur van de rand |
| background | string | Nee | `"transparent"` | Hoekopvulling: `"transparent"` of een hex-kleur |
| outputSize | integer | Nee | - | Uiteindelijke vierkante afmeting in pixels (16-4096) |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Opmerkingen {#notes}

- De uitvoer is altijd PNG om de transparante hoeken te behouden (tenzij `background` is ingesteld op een effen kleur).
- De cirkel wordt ingeschreven binnen de kortste afmeting van de afbeelding. Gebruik `zoom` om strakker bij te snijden en `offsetX`/`offsetY` om het zichtbare gebied te verschuiven.
- Wanneer `outputSize` is opgegeven, wordt het resultaat na het bijsnijden naar die vierkante afmeting geschaald.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de verwerking.
