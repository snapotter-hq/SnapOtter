---
description: "Automatisk förbättring med ett klick som analyserar en bild och korrigerar exponering, kontrast, vitbalans, mättnad och skärpa."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: f54fc5467558
---

# Bildförbättring {#image-enhancement}

Automatisk förbättring med ett klick och smart analys. Analyserar bilden och tillämpar korrigeringar för exponering, kontrast, vitbalans, mättnad, skärpa och brusreducering.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Bearbetning:** Synkron (använder fabriken `createToolRoute`, returnerar resultatet direkt)

**Modellpaket:** Inget krävs för grundläggande förbättring. Paketet `upscale-enhance` (5-6 GB) används endast när `deepEnhance` är aktiverat (för AI-brusreducering via SCUNet).

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| mode | string | Nej | `"auto"` | Förbättringsläge: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Nej | `50` | Total förbättringsintensitet (0-100) |
| corrections | object | Nej | alla `true` | Selektiva korrigeringar att tillämpa (se nedan) |
| deepEnhance | boolean | Nej | `false` | Aktivera AI-driven brusreducering (kräver att verktyget `noise-removal` är installerat) |

### Korrigeringsobjekt {#corrections-object}

| Fält | Typ | Standard | Beskrivning |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Korrigera exponering automatiskt |
| contrast | boolean | `true` | Korrigera kontrast automatiskt |
| whiteBalance | boolean | `true` | Korrigera vitbalans automatiskt |
| saturation | boolean | `true` | Korrigera mättnad automatiskt |
| sharpness | boolean | `true` | Skärp automatiskt |
| denoise | boolean | `true` | Lätt brusreducering |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Svar (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analysslutpunkt {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analyserar en bild och returnerar korrigeringsrekommendationer utan att tillämpa dem.

### Parametrar {#parameters-1}

| Parameter | Typ | Obligatorisk | Beskrivning |
|-----------|------|----------|-------------|
| file | file | Ja | Bildfil (multipart) |

### Exempelbegäran {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Svar (200 OK) {#response-200-ok-1}

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

## Anmärkningar {#notes}

- Detta verktyg använder den synkrona fabriken `createToolRoute`, så det returnerar ett standardsvar (inte 202 asynkront).
- Parametern `mode` justerar hur korrigeringar viktas (t.ex. är porträttläget mildare mot hudtoner, landskapsläget höjer mättnaden).
- När `deepEnhance` är aktiverat och verktyget `noise-removal` (SCUNet) är installerat tillämpas en extra AI-brusreduceringsomgång efter standardkorrigeringarna.
- Analysslutpunkten är användbar för att förhandsgranska vilka korrigeringar som skulle tillämpas innan man bekräftar.
- Stöder HEIC/HEIF, RAW, TGA, PSD, EXR och HDR som inmatningsformat via automatisk avkodning.
