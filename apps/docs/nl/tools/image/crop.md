---
description: "Snijd afbeeldingen bij door een gebied met positie en afmetingen op te geven."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: 132d91d80d4e
---

# Afbeelding bijsnijden {#crop}

Snijd afbeeldingen bij door een rechthoekig gebied te definiëren met positie en grootte. Ondersteunt zowel pixel- als percentage-eenheden.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/crop`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| left | number | Ja | - | X-offset van het uitsnijgebied (vanaf de linkerrand) |
| top | number | Ja | - | Y-offset van het uitsnijgebied (vanaf de bovenrand) |
| width | number | Ja | - | Breedte van het uitsnijgebied |
| height | number | Ja | - | Hoogte van het uitsnijgebied |
| unit | string | Nee | `"px"` | Eenheid voor de waarden: `px` of `percent` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Bijsnijden met percentagewaarden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Opmerkingen {#notes}

- Het uitsnijgebied moet binnen de grenzen van de afbeelding vallen. Als het gebied buiten de afbeelding valt, mislukt het verzoek.
- Bij gebruik van de eenheid `percent` vertegenwoordigen de waarden percentages van de afbeeldingsafmetingen (bijv. `left: 10` betekent 10% vanaf de linkerrand).
- Het uitvoerformaat komt overeen met het invoerformaat.
- De EXIF-oriëntatie wordt automatisch toegepast vóór het bijsnijden, zodat de coördinaten overeenkomen met de visueel correcte oriëntatie.
