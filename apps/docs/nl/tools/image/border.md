---
description: "Voeg randen, opvulling, afgeronde hoeken en slagschaduwen toe aan afbeeldingen in een voorspelbare, beheersbare volgorde."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 7e6b498b0d4e
---

# Rand & frame {#border-frame}

Voeg randen, opvulling, afgeronde hoeken en slagschaduwen toe aan afbeeldingen. De tool past effecten in deze volgorde toe: opvulling, rand, hoekradius en vervolgens schaduw.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| borderWidth | number | Nee | 10 | Randdikte in pixels (0 tot 2000) |
| borderColor | string | Nee | `"#000000"` | Randkleur als hex (bijv. `#FF0000`) |
| padding | number | Nee | 0 | Binnenopvulling tussen afbeelding en rand in pixels (0 tot 200) |
| paddingColor | string | Nee | `"#FFFFFF"` | Opvulkleur als hex |
| cornerRadius | number | Nee | 0 | Hoekradius in pixels (0 tot 2000) |
| shadow | boolean | Nee | `false` | Of er een slagschaduw wordt toegevoegd |
| shadowBlur | number | Nee | 15 | Vervagingsstraal van de schaduw (1 tot 200) |
| shadowOffsetX | number | Nee | 0 | Horizontale verschuiving van de schaduw (-50 tot 50) |
| shadowOffsetY | number | Nee | 5 | Verticale verschuiving van de schaduw (-50 tot 50) |
| shadowColor | string | Nee | `"#000000"` | Schaduwkleur als hex |
| shadowOpacity | number | Nee | 40 | Dekkingspercentage van de schaduw (0 tot 100) |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Opmerkingen {#notes}

- Gebruikt de standaardfactory `createToolRoute`. Accepteert één afbeeldingsbestand via multipart-upload.
- Ondersteunt de invoerformaten HEIC, RAW, PSD en SVG (automatisch gedecodeerd).
- Verwerkingsvolgorde: eerst wordt de opvulling toegevoegd, daarna wordt de rand eromheen geplaatst, vervolgens wordt de hoekradius toegepast en ten slotte wordt de schaduw samengesteld.
- Wanneer `cornerRadius` of `shadow` is ingeschakeld, wordt de uitvoer geforceerd naar PNG (ongeacht het invoerformaat) om de transparantie te behouden. Formaten die alfa ondersteunen (PNG, WebP, AVIF) behouden hun oorspronkelijke formaat.
- De schaduw is vormbewust: hij volgt de afgeronde hoeken in plaats van een rechthoekige schaduw te creëren.
- Door `borderWidth` op 0 te zetten en alleen `cornerRadius` + `shadow` te gebruiken, ontstaat een randloos afgerond schaduweffect.
