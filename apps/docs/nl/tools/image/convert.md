---
description: "Converteer afbeeldingen tussen formaten, waaronder moderne formaten zoals AVIF, JXL en HEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: 312bf34b0b8a
---

# Afbeelding converteren {#convert}

Converteer afbeeldingen tussen formaten. Ondersteunt gangbare webformaten en gespecialiseerde formaten zoals HEIC, JXL, BMP, ICO, JP2, QOI en PSD.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/convert`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Doelformaat: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Nee | - | Uitvoerkwaliteit (1-100). Van toepassing op verliesgevende formaten zoals jpg, webp, avif, heic. |

## Ondersteunde uitvoerformaten {#supported-output-formats}

| Formaat | Type | Opmerkingen |
|--------|------|-------|
| jpg | Verliesgevend | JPEG, beste compatibiliteit |
| png | Verliesvrij | Ondersteunt transparantie |
| webp | Beide | Modern webformaat, goede compressie |
| avif | Verliesgevend | Next-gen-formaat, uitstekende compressie |
| tiff | Beide | Print-/publicatieworkflows |
| gif | Verliesvrij | Beperkt tot 256 kleuren |
| heic / heif | Verliesgevend | Formaat van het Apple-ecosysteem |
| jxl | Beide | JPEG XL, next-gen-formaat |
| bmp | Verliesvrij | Ongecomprimeerde bitmap |
| ico | Verliesvrij | Windows-pictogramformaat |
| jp2 | Verliesgevend | JPEG 2000 |
| qoi | Verliesvrij | Quite OK Image-formaat |
| psd | Gelaagd | Adobe Photoshop (vereist ImageMagick) |
| ppm | Verliesvrij | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vector | Encapsulated PostScript |
| tga | Verliesvrij | Targa-afbeeldingsformaat |

## Voorbeeldverzoek {#example-request}

Naar WebP converteren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Naar PNG converteren (verliesvrij):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Opmerkingen {#notes}

- De extensie van de uitvoerbestandsnaam wordt automatisch bijgewerkt zodat deze overeenkomt met het doelformaat.
- SVG-invoer wordt vóór de conversie gerasterd op 300 DPI.
- PSD-conversie vereist dat ImageMagick op de server is geïnstalleerd.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI en TGA gebruiken gespecialiseerde CLI-encoders en omzeilen de Sharp-verwerking.
- HEIC/HEIF-codering gebruikt de HEIC-encoderbibliotheek van het systeem.
- De invoerformaten zijn breed: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, enz.), PSD, SVG, BMP en meer.
