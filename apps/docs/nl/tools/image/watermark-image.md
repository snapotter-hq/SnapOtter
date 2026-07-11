---
description: "Een logo of afbeelding als watermerk overleggen met configureerbare positie, dekking en schaal."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 55ba18943b55
---

# Afbeeldingswatermerk {#image-watermark}

Leg een logo of secundaire afbeelding als watermerk over een basisafbeelding. Het watermerk wordt geschaald ten opzichte van de breedte van de basisafbeelding en in een hoek of in het midden geplaatst.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Accepteert multipart form data met **twee** afbeeldingsbestanden en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| position | string | Nee | `"bottom-right"` | Plaatsing van het watermerk: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | Nee | `50` | Dekkingspercentage van het watermerk (0 tot 100) |
| scale | number | Nee | `25` | Watermerkbreedte als percentage van de breedte van de hoofdafbeelding (1 tot 100) |

### Bestandsvelden {#file-fields}

| Veldnaam | Vereist | Beschrijving |
|------------|----------|-------------|
| file | Ja | De hoofd-/basisafbeelding |
| watermark | Ja | De watermerk-/logoafbeelding |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Opmerkingen {#notes}

- Beide afbeeldingen worden gevalideerd en gedecodeerd (HEIC, RAW, PSD, SVG ondersteund).
- Het watermerk wordt proportioneel geschaald zodat de breedte gelijk is aan `scale`% van de breedte van de hoofdafbeelding.
- De dekking wordt toegepast via een alfamasker dat wordt samengesteld met `dest-in`-menging.
- Hoekposities gebruiken een opvulling van 20px vanaf de rand van de afbeelding.
- Als de watermerkafbeelding transparantie heeft (bijv. een PNG-logo), blijft deze behouden tijdens het samenstellen.
- De EXIF-oriëntatie wordt automatisch toegepast op beide afbeeldingen vóór verwerking.
