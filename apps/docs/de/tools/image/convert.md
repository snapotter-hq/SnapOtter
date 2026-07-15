---
description: "Konvertiert Bilder zwischen Formaten, einschließlich moderner Formate wie AVIF, JXL und HEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: 1a9d52e38c55
---

# Bild konvertieren {#convert}

Konvertiert Bilder zwischen Formaten. Unterstützt gängige Webformate sowie spezialisierte Formate wie HEIC, JXL, BMP, ICO, JP2, QOI und PSD.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/convert`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Zielformat: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Nein | - | Ausgabequalität (1-100). Gilt für verlustbehaftete Formate wie jpg, webp, avif, heic. |

## Unterstützte Ausgabeformate {#supported-output-formats}

| Format | Typ | Hinweise |
|--------|------|-------|
| jpg | Verlustbehaftet | JPEG, beste Kompatibilität |
| png | Verlustfrei | Unterstützt Transparenz |
| webp | Beides | Modernes Webformat, gute Komprimierung |
| avif | Verlustbehaftet | Format der nächsten Generation, ausgezeichnete Komprimierung |
| tiff | Beides | Druck-/Publishing-Workflows |
| gif | Verlustfrei | Auf 256 Farben beschränkt |
| heic / heif | Verlustbehaftet | Format des Apple-Ökosystems |
| jxl | Beides | JPEG XL, Format der nächsten Generation |
| bmp | Verlustfrei | Unkomprimierte Bitmap |
| ico | Verlustfrei | Windows-Symbolformat |
| jp2 | Verlustbehaftet | JPEG 2000 |
| qoi | Verlustfrei | Quite OK Image-Format |
| psd | Ebenen | Adobe Photoshop (erfordert ImageMagick) |
| ppm | Verlustfrei | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vektor | Encapsulated PostScript |
| tga | Verlustfrei | Targa-Bildformat |

## Beispielanfrage {#example-request}

In WebP konvertieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

In PNG konvertieren (verlustfrei):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Hinweise {#notes}

- Die Erweiterung des Ausgabedateinamens wird automatisch an das Zielformat angepasst.
- SVG-Eingaben werden vor der Konvertierung mit 300 DPI gerastert.
- Die PSD-Konvertierung erfordert, dass ImageMagick auf dem Server installiert ist.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI und TGA verwenden spezialisierte CLI-Encoder und umgehen die Sharp-Verarbeitung.
- Die HEIC/HEIF-Kodierung verwendet die HEIC-Encoder-Bibliothek des Systems.
- Die Eingabeformate sind vielfältig: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW usw.), PSD, SVG, BMP und mehr.
