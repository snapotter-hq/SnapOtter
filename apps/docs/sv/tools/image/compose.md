---
description: "Skikta bilder med position, opacitet och blandningslägen för komposition."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: df4f410a8045
---

# Bildkomposition {#image-composition}

Lägg en överliggande bild ovanpå en basbild med konfigurerbar position, opacitet och blandningsläge. Användbart för att komponera logotyper, grafik eller kombinera flera bilder.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/compose`

Tar emot multipart-formulärdata med **två** bildfiler och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| x | number | Nej | `0` | Horisontell förskjutning av överlägget från det övre vänstra hörnet i pixlar (min 0) |
| y | number | Nej | `0` | Vertikal förskjutning av överlägget från det övre vänstra hörnet i pixlar (min 0) |
| opacity | number | Nej | `100` | Överläggets opacitet i procent (0 till 100) |
| blendMode | string | Nej | `"over"` | Blandningsläge för komposition |

### Blandningslägen {#blend-modes}

| Värde | Beskrivning |
|-------|-------------|
| `over` | Normalt överlägg (standard) |
| `multiply` | Mörka genom att multiplicera pixelvärden |
| `screen` | Ljusa genom att invertera, multiplicera och invertera igen |
| `overlay` | Kombinerar multiplicera och rastrera baserat på basens ljusstyrka |
| `darken` | Behåll den mörkare pixeln från varje lager |
| `lighten` | Behåll den ljusare pixeln från varje lager |
| `hard-light` | Starkt kontrastöverlägg |
| `soft-light` | Subtilt kontrastöverlägg |
| `difference` | Absolut skillnad mellan lager |
| `exclusion` | Liknar skillnad men med lägre kontrast |

### Filfält {#file-fields}

| Fältnamn | Obligatorisk | Beskrivning |
|------------|----------|-------------|
| file | Ja | Bas-/bakgrundsbilden |
| overlay | Ja | Överläggs-/förgrundsbilden |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Med blandningsläget multiplicera:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Anteckningar {#notes}

- Båda bilderna valideras och avkodas (HEIC, RAW, PSD, SVG stöds) före komposition.
- Överlägget placeras vid de exakta pixelkoordinater som anges av `x` och `y`. Det storleksändras inte för att passa.
- Om opaciteten är mindre än 100 tillämpas en alfamask på överlägget före blandning.
- Överlägget kan sträcka sig utanför basbildens gränser (det kommer att beskäras).
- EXIF-orientering tillämpas automatiskt på båda bilderna före bearbetning.
- Utdatans dimensioner matchar basbildens dimensioner.
