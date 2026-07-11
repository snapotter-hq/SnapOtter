---
description: "Justera ljusstyrka, kontrast, mättnad, temperatur, nyans, kanaler och tillämpa färgeffekter."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: de89d38e5a20
---

# Justera färger {#adjust-colors}

Ett heltäckande färgjusteringsverktyg som kombinerar ljusstyrka, kontrast, exponering, mättnad, temperatur, färgton, nyansrotation, nivåer per kanal och effekter med ett klick (gråskala, sepia, invertering) i en enda slutpunkt.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| brightness | tal | Nej | `0` | Justering av ljusstyrka (-100 till 100) |
| contrast | tal | Nej | `0` | Justering av kontrast (-100 till 100) |
| exposure | tal | Nej | `0` | Exponering / mellantonsgamma (-100 till 100) |
| saturation | tal | Nej | `0` | Färgmättnad (-100 till 100) |
| temperature | tal | Nej | `0` | Vitbalans: kall/blå till varm/orange (-100 till 100) |
| tint | tal | Nej | `0` | Färgskiftning: grön till magenta (-100 till 100) |
| hue | tal | Nej | `0` | Nyansrotation i grader (-180 till 180) |
| sharpness | tal | Nej | `0` | Skärpningsstyrka (0 till 100) |
| red | tal | Nej | `100` | Nivå för röd kanal (0 till 200, 100 = oförändrad) |
| green | tal | Nej | `100` | Nivå för grön kanal (0 till 200, 100 = oförändrad) |
| blue | tal | Nej | `100` | Nivå för blå kanal (0 till 200, 100 = oförändrad) |
| effect | sträng | Nej | `"none"` | Färgeffekt: `none`, `grayscale`, `sepia`, `invert` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Tillämpa ett varmt vintageutseende:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Anteckningar {#notes}

- Alla parametrar har som standard neutrala värden så att du bara justerar det du behöver.
- Justeringarna tillämpas i den här ordningen: ljusstyrka, kontrast, exponering, mättnad/nyans, temperatur/färgskiftning, skärpa, kanaler, effekter.
- Temperatur använder en 3x3-matris för färgrekombination på axlarna blå-orange och grön-magenta.
- Exponering mappas till Sharps gamma-funktion (positiva värden ljusar upp mellantonerna, negativa mörkar ner dem).
- Den här slutpunkten svarar även på de äldre sökvägarna `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` och `/api/v1/tools/image/color-effects`. Alla använder samma schema.
- Utdataformatet matchar indataformatet. HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före bearbetning.
