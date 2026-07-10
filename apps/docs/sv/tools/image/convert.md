---
description: "Konvertera bilder mellan format, inklusive moderna format som AVIF, JXL och HEIC."
i18n_source_hash: 562f8270e8c3
i18n_provenance: human
i18n_output_hash: 84c5f269c843
---

# Konvertera {#convert}

Konvertera bilder mellan format. Stöder vanliga webbformat samt specialiserade format som HEIC, JXL, BMP, ICO, JP2, QOI och PSD.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/convert`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Målformat: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Nej | - | Utdatakvalitet (1-100). Gäller förlustbehäftade format som jpg, webp, avif, heic. |

## Utdataformat som stöds {#supported-output-formats}

| Format | Typ | Anteckningar |
|--------|------|-------|
| jpg | Förlustbehäftat | JPEG, bäst kompatibilitet |
| png | Förlustfritt | Stöder transparens |
| webp | Båda | Modernt webbformat, bra komprimering |
| avif | Förlustbehäftat | Nästa generations format, utmärkt komprimering |
| tiff | Båda | Tryck-/publiceringsarbetsflöden |
| gif | Förlustfritt | Begränsat till 256 färger |
| heic / heif | Förlustbehäftat | Apples ekosystemformat |
| jxl | Båda | JPEG XL, nästa generations format |
| bmp | Förlustfritt | Okomprimerad bitmapp |
| ico | Förlustfritt | Windows-ikonformat |
| jp2 | Förlustbehäftat | JPEG 2000 |
| qoi | Förlustfritt | Quite OK Image-format |
| psd | Skiktat | Adobe Photoshop (kräver ImageMagick) |
| ppm | Förlustfritt | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vektor | Encapsulated PostScript |
| tga | Förlustfritt | Targa-bildformat |

## Exempelbegäran {#example-request}

Konvertera till WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Konvertera till PNG (förlustfritt):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Anteckningar {#notes}

- Utdatafilens filtillägg uppdateras automatiskt för att matcha målformatet.
- SVG-indata rastreras vid 300 DPI före konvertering.
- PSD-konvertering kräver att ImageMagick är installerat på servern.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI och TGA använder specialiserade CLI-kodare och kringgår Sharp-bearbetning.
- HEIC/HEIF-kodning använder systemets HEIC-kodarbibliotek.
- Indataformaten är breda: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW osv.), PSD, SVG, BMP med flera.
