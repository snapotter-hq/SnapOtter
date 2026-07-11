---
description: "Automatische verbetering met één klik die een afbeelding analyseert en de belichting, het contrast, de witbalans, de verzadiging en de scherpte corrigeert."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: f913171103cf
---

# Afbeeldingsverbetering {#image-enhancement}

Automatische verbetering met één klik en slimme analyse. Analyseert de afbeelding en past correcties toe voor belichting, contrast, witbalans, verzadiging, scherpte en ruisonderdrukking.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Verwerking:** Synchroon (gebruikt de `createToolRoute`-factory, retourneert het resultaat rechtstreeks)

**Modelbundel:** Geen vereist voor basisverbetering. De bundel `upscale-enhance` (5-6 GB) wordt alleen gebruikt wanneer `deepEnhance` is ingeschakeld (voor AI-ruisonderdrukking via SCUNet).

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| mode | string | Nee | `"auto"` | Verbeteringsmodus: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Nee | `50` | Algehele verbeteringsintensiteit (0-100) |
| corrections | object | Nee | alle `true` | Selectieve correcties om toe te passen (zie hieronder) |
| deepEnhance | boolean | Nee | `false` | Schakel AI-aangedreven ruisonderdrukking in (vereist dat het hulpmiddel `noise-removal` is geïnstalleerd) |

### Corrections-object {#corrections-object}

| Veld | Type | Standaard | Beschrijving |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Belichting automatisch corrigeren |
| contrast | boolean | `true` | Contrast automatisch corrigeren |
| whiteBalance | boolean | `true` | Witbalans automatisch corrigeren |
| saturation | boolean | `true` | Verzadiging automatisch corrigeren |
| sharpness | boolean | `true` | Automatisch verscherpen |
| denoise | boolean | `true` | Lichte ruisonderdrukking |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Antwoord (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze-endpoint {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analyseert een afbeelding en retourneert correctie-aanbevelingen zonder ze toe te passen.

### Parameters {#parameters-1}

| Parameter | Type | Vereist | Beschrijving |
|-----------|------|----------|-------------|
| file | file | Ja | Afbeeldingsbestand (multipart) |

### Voorbeeldverzoek {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Antwoord (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Opmerkingen {#notes}

- Dit hulpmiddel gebruikt de synchrone `createToolRoute`-factory, dus het retourneert een standaardantwoord (geen 202 async).
- De parameter `mode` past aan hoe correcties worden gewogen (bijvoorbeeld: de portretmodus is voorzichtiger met huidtinten, de landschapsmodus versterkt de verzadiging).
- Wanneer `deepEnhance` is ingeschakeld en het hulpmiddel `noise-removal` (SCUNet) is geïnstalleerd, wordt een extra AI-ruisonderdrukkingsstap toegepast na de standaardcorrecties.
- Het analyze-endpoint is handig om te bekijken welke correcties zouden worden toegepast voordat je ze toepast.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
