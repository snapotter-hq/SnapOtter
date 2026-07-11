---
description: "Draai afbeeldingen onder elke hoek en spiegel ze horizontaal of verticaal."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: 5fd343c155c7
---

# Rotate & Flip {#rotate-flip}

Draai afbeeldingen onder een willekeurige hoek en/of spiegel ze horizontaal of verticaal. Draai- en spiegelbewerkingen kunnen in één verzoek worden gecombineerd.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Accepteert multipart form data met een afbeeldingsbestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| angle | number | Nee | `0` | Draaihoek in graden (met de klok mee). Accepteert elke numerieke waarde. |
| horizontal | boolean | Nee | `false` | De afbeelding horizontaal spiegelen |
| vertical | boolean | Nee | `false` | De afbeelding verticaal spiegelen |

## Example Request {#example-request}

90 graden met de klok mee draaien:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Horizontaal spiegelen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Draaien en spiegelen samen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- De draaiing wordt eerst toegepast, daarna de spiegelbewerkingen.
- Draaiingen die geen veelvoud van 90 graden zijn (bijv. 45 graden) vergroten het canvas om de gedraaide afbeelding te laten passen, met een transparante of zwarte vulling afhankelijk van het uitvoerformaat.
- Veelgebruikte waarden: 90, 180, 270 voor kwartslagdraaiingen.
- EXIF-oriëntatie wordt automatisch toegepast voordat er verwerkt wordt, dus de draaiing is relatief ten opzichte van de visuele oriëntatie.
