---
description: "Pas helderheid, contrast, verzadiging, temperatuur, tint en kanalen aan en pas kleureffecten toe."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 474c66398755
---

# Kleuren aanpassen {#adjust-colors}

Uitgebreide tool voor kleuraanpassing die helderheid, contrast, belichting, verzadiging, temperatuur, tint, kleurtoonrotatie, niveaus per kanaal en één-klik-effecten (grijstinten, sepia, inverteren) combineert in één endpoint.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| brightness | number | Nee | `0` | Helderheidsaanpassing (-100 tot 100) |
| contrast | number | Nee | `0` | Contrastaanpassing (-100 tot 100) |
| exposure | number | Nee | `0` | Belichting / gamma van middentonen (-100 tot 100) |
| saturation | number | Nee | `0` | Kleurverzadiging (-100 tot 100) |
| temperature | number | Nee | `0` | Witbalans: koel/blauw tot warm/oranje (-100 tot 100) |
| tint | number | Nee | `0` | Tintverschuiving: groen naar magenta (-100 tot 100) |
| hue | number | Nee | `0` | Kleurtoonrotatie in graden (-180 tot 180) |
| sharpness | number | Nee | `0` | Verscherpingssterkte (0 tot 100) |
| red | number | Nee | `100` | Niveau van het rode kanaal (0 tot 200, 100 = ongewijzigd) |
| green | number | Nee | `100` | Niveau van het groene kanaal (0 tot 200, 100 = ongewijzigd) |
| blue | number | Nee | `100` | Niveau van het blauwe kanaal (0 tot 200, 100 = ongewijzigd) |
| effect | string | Nee | `"none"` | Kleureffect: `none`, `grayscale`, `sepia`, `invert` |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Pas een warme vintage look toe:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Opmerkingen {#notes}

- Alle parameters hebben standaard neutrale waarden, zodat je alleen aanpast wat je nodig hebt.
- Aanpassingen worden in deze volgorde toegepast: helderheid, contrast, belichting, verzadiging/kleurtoon, temperatuur/tint, verscherping, kanalen, effecten.
- Temperatuur gebruikt een 3x3-matrix voor kleurhercombinatie op de blauw-oranje- en groen-magenta-assen.
- Belichting wordt gekoppeld aan de gammafunctie van Sharp (positief maakt middentonen lichter, negatief maakt ze donkerder).
- Dit endpoint reageert ook op de verouderde paden `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` en `/api/v1/tools/image/color-effects`. Alle gebruiken hetzelfde schema.
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de verwerking.
