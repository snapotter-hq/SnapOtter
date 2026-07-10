---
description: "Kombinera en eller flera bilder till ett PDF-dokument med alternativ för sidstorlek, orientering och målfilstorlek."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: c8a36bb65a34
---

# Bild till PDF {#image-to-pdf}

Kombinera en eller flera bilder till ett PDF-dokument. Stöder flera sidstorlekar, orienteringar, marginaler och valfri målfilstorlek via kvalitetsjustering.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Tar emot multipart-formulärdata med en eller flera bildfiler och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| pageSize | string | Nej | `"A4"` | Sidstorlek: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Nej | `"portrait"` | Sidorientering: `portrait` eller `landscape` |
| margin | number | Nej | `20` | Sidmarginal i punkter (0-500) |
| targetSize | object | Nej | - | Begränsning för målfilstorlek (se nedan) |
| collate | boolean | Nej | `true` | Kombinera alla bilder till en PDF. Om `false` skapas en PDF per bild. |

### Målstorleksobjekt {#target-size-object}

| Fält | Typ | Obligatorisk | Beskrivning |
|-------|------|----------|-------------|
| value | number | Ja | Målstorleksvärde |
| unit | string | Ja | Enhet: `KB` eller `MB` |

Minsta målstorlek är 50 KB.

## Exempelbegäran {#example-request}

Grundläggande PDF med flera bilder:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Med målfilstorlek:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

En PDF per bild:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Exempelsvar (sammanfogat) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Exempelsvar (ej sammanfogat) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Exempelsvar (med målstorlek) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Anmärkningar {#notes}

- Bilder centreras på sidan och skalas för att passa inom marginalerna med bibehållet bildförhållande. Bilder förstoras aldrig.
- När `collate` är `false` blir varje bild en separat PDF-fil, och nedladdningen är ett ZIP-arkiv som innehåller alla PDF-filer.
- Funktionen för målstorlek använder iterativ binärsökning över JPEG-kvalitetsnivåer (10-95) för att hitta den bästa kvaliteten som ryms inom budgeten.
- Transparenta bilder plattas ut till vitt innan de bäddas in i PDF-filen.
- Format som stöds för inmatning: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG med flera.
- EXIF-orientering tillämpas automatiskt före inbäddning.
