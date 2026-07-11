---
description: "Konvertera animerad GIF till WebP och vice versa, med bevarande av alla bildrutor."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 4f12db13d80c
---

# GIF/WebP-konverterare {#gif-webp-converter}

Konvertera animerade GIF-filer till WebP och vice versa, med bevarande av alla bildrutor och animationstiming. WebP-animationer är vanligtvis 25-35% mindre än motsvarande GIF-filer.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Tar emot multipart-formulärdata med en GIF- eller WebP-fil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| quality | integer | Nej | `80` | Utdatakvalitet för WebP-kodning (1-100) |
| lossless | boolean | Nej | `false` | Använd förlustfri WebP-komprimering |
| resizePercent | integer | Nej | `100` | Skala utdata med procent (10-100) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Anmärkningar {#notes}

- Endast `.gif`- och `.webp`-filer accepteras. Andra bildformat stöds inte av detta verktyg.
- Konverteringsriktningen är automatisk: GIF-inmatning ger WebP-utdata, och WebP-inmatning ger GIF-utdata.
- Alternativen `quality` och `lossless` gäller endast vid kodning till WebP. Vid konvertering till GIF använder utdata standard-GIF-paletten.
- Använd `resizePercent` för att minska dimensionerna (och filstorleken) på stora animationer.
