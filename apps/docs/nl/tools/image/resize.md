---
description: "Verklein of vergroot afbeeldingen op pixels, percentage of met fit-modi."
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: ddca03289601
---

# Resize {#resize}

Pas de grootte van afbeeldingen aan door exacte pixelafmetingen op te geven, een percentageschaalfactor of een fit-modus die bepaalt hoe de afbeelding zich aanpast aan de doelafmetingen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/resize`

Accepteert multipart form data met een afbeeldingsbestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| width | integer | Nee | - | Doelbreedte in pixels (max. 16383) |
| height | integer | Nee | - | Doelhoogte in pixels (max. 16383) |
| fit | string | Nee | `"contain"` | Hoe de afbeelding in de afmetingen past: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | Nee | `false` | Opschalen voorkomen als de afbeelding kleiner is dan het doel |
| percentage | number | Nee | - | Schalen met een percentage (bijv. 50 voor de helft van de grootte) |

Ten minste een van `width`, `height` of `percentage` moet worden opgegeven.

### Fit Modes {#fit-modes}

- **contain** - Pas de grootte aan zodat deze binnen de afmetingen past, met behoud van de beeldverhouding (kan lege ruimte overlaten)
- **cover** - Pas de grootte aan zodat de afmetingen worden gevuld, met behoud van de beeldverhouding (kan bijsnijden)
- **fill** - Uitrekken om exact overeen te komen met de afmetingen (negeert de beeldverhouding)
- **inside** - Zoals `contain`, maar verkleint alleen, vergroot nooit
- **outside** - Zoals `cover`, maar verkleint alleen, vergroot nooit

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Grootte aanpassen met een percentage:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- De maximale afmeting is 16383 pixels op beide assen (limiet van Sharp/libvips).
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd voordat deze wordt verwerkt.
- EXIF-oriëntatie wordt automatisch toegepast voordat de grootte wordt aangepast.
- De vlag `withoutEnlargement` is handig voor batchverwerking waarbij sommige afbeeldingen mogelijk al kleiner zijn dan het doel.
