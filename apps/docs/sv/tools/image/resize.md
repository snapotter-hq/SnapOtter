---
description: "Ändra storlek på bilder efter pixlar, procent eller med anpassningslägen."
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: 1e73827cf480
---

# Ändra storlek {#resize}

Ändra storlek på bilder genom att ange exakta pixeldimensioner, en procentuell skalfaktor eller ett anpassningsläge som styr hur bilden anpassas till måldimensionerna.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/resize`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| width | integer | Nej | - | Målbredd i pixlar (max 16383) |
| height | integer | Nej | - | Målhöjd i pixlar (max 16383) |
| fit | string | Nej | `"contain"` | Hur bilden anpassas till dimensionerna: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | Nej | `false` | Förhindra uppskalning om bilden är mindre än målet |
| percentage | number | Nej | - | Skala med procent (t.ex. 50 för halv storlek) |

Minst en av `width`, `height` eller `percentage` måste anges.

### Anpassningslägen {#fit-modes}

- **contain** - Ändra storlek för att rymmas inom dimensionerna, med bevarat bildförhållande (kan lämna tomt utrymme)
- **cover** - Ändra storlek för att täcka dimensionerna, med bevarat bildförhållande (kan beskära)
- **fill** - Sträck ut för att exakt matcha dimensionerna (ignorerar bildförhållande)
- **inside** - Som `contain`, men skalar bara ned, aldrig upp
- **outside** - Som `cover`, men skalar bara ned, aldrig upp

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Ändra storlek med procent:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Anteckningar {#notes}

- Maximal dimension är 16383 pixlar på vardera axeln (Sharp/libvips-gräns).
- Utdataformatet matchar indataformatet. HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före bearbetning.
- EXIF-orientering appliceras automatiskt före storleksändring.
- Flaggan `withoutEnlargement` är användbar för batchbearbetning där vissa bilder redan kan vara mindre än målet.
