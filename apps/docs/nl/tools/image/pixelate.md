---
description: "Pas een pixelatie-effect toe op de volledige afbeelding of een specifiek gebied."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 07b6715bb818
---

# Pixelate {#pixelate}

Pas een pixelatie-effect toe op een volledige afbeelding of een specifiek rechthoekig gebied. Handig om gevoelige inhoud onherkenbaar te maken, zoals gezichten, kentekenplaten of persoonlijke informatie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Accepteert multipart form data met een afbeeldingsbestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Nee | `12` | Grootte van het pixelblok (2-128); grotere waarden geven een grovere pixelatie |
| region | object | Nee | - | Beperk de pixelatie tot een rechthoek (zie hieronder) |

### Region Object {#region-object}

| Veld | Type | Vereist | Beschrijving |
|-------|------|----------|-------------|
| left | integer | Ja | Linkeroffset in pixels (>= 0) |
| top | integer | Ja | Bovenoffset in pixels (>= 0) |
| width | integer | Ja | Breedte van het gebied in pixels (>= 1) |
| height | integer | Ja | Hoogte van het gebied in pixels (>= 1) |

## Example Request {#example-request}

Pixelateer de volledige afbeelding:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixelateer een specifiek gebied:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- Wanneer `region` wordt weggelaten, wordt de hele afbeelding gepixelateerd.
- De coördinaten van het gebied zijn in pixels ten opzichte van de linkerbovenhoek van de afbeelding. Het gebied moet binnen de grenzen van de afbeelding vallen.
- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd voordat deze wordt verwerkt.
