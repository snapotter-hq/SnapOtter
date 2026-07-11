---
description: "Converti immagini tra formati, inclusi formati moderni come AVIF, JXL e HEIC."
i18n_source_hash: 562f8270e8c3
i18n_provenance: human
i18n_output_hash: cc7a9af253e2
---

# Converti {#convert}

Converti immagini tra formati. Supporta i formati web comuni oltre a formati specializzati come HEIC, JXL, BMP, ICO, JP2, QOI e PSD.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/convert`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| format | string | Sì | - | Formato di destinazione: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | No | - | Qualità di output (1-100). Si applica ai formati con perdita come jpg, webp, avif, heic. |

## Formati di output supportati {#supported-output-formats}

| Formato | Tipo | Note |
|--------|------|-------|
| jpg | Con perdita | JPEG, migliore compatibilità |
| png | Senza perdita | Supporta la trasparenza |
| webp | Entrambi | Formato web moderno, buona compressione |
| avif | Con perdita | Formato di nuova generazione, compressione eccellente |
| tiff | Entrambi | Flussi di lavoro per stampa/editoria |
| gif | Senza perdita | Limitato a 256 colori |
| heic / heif | Con perdita | Formato dell'ecosistema Apple |
| jxl | Entrambi | JPEG XL, formato di nuova generazione |
| bmp | Senza perdita | Bitmap non compressa |
| ico | Senza perdita | Formato icona di Windows |
| jp2 | Con perdita | JPEG 2000 |
| qoi | Senza perdita | Formato Quite OK Image |
| psd | A livelli | Adobe Photoshop (richiede ImageMagick) |
| ppm | Senza perdita | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vettoriale | Encapsulated PostScript |
| tga | Senza perdita | Formato immagine Targa |

## Esempio di richiesta {#example-request}

Converti in WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Converti in PNG (senza perdita):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Note {#notes}

- L'estensione del nome del file di output viene aggiornata automaticamente per corrispondere al formato di destinazione.
- Gli input SVG vengono rasterizzati a 300 DPI prima della conversione.
- La conversione PSD richiede che ImageMagick sia installato sul server.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI e TGA usano encoder CLI specializzati e bypassano l'elaborazione di Sharp.
- La codifica HEIC/HEIF usa la libreria di codifica HEIC di sistema.
- I formati di input sono ampi: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, ecc.), PSD, SVG, BMP e altri.
