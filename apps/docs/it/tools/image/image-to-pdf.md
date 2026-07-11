---
description: "Combina una o più immagini in un documento PDF con opzioni di formato pagina, orientamento e dimensione del file target."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 48b9e834e4cf
---

# Immagine in PDF {#image-to-pdf}

Combina una o più immagini in un documento PDF. Supporta più formati pagina, orientamenti, margini e il targeting facoltativo della dimensione del file tramite regolazione della qualità.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Accetta dati di form multipart con una o più immagini e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"A4"` | Formato pagina: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | No | `"portrait"` | Orientamento della pagina: `portrait` o `landscape` |
| margin | number | No | `20` | Margine della pagina in punti (0-500) |
| targetSize | object | No | - | Vincolo sulla dimensione del file target (vedi sotto) |
| collate | boolean | No | `true` | Combina tutte le immagini in un unico PDF. Se `false`, crea un PDF per immagine. |

### Oggetto Target Size {#target-size-object}

| Campo | Tipo | Obbligatorio | Descrizione |
|-------|------|----------|-------------|
| value | number | Sì | Valore della dimensione target |
| unit | string | Sì | Unità: `KB` o `MB` |

La dimensione target minima è 50 KB.

## Richiesta di Esempio {#example-request}

PDF multi-immagine di base:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Con dimensione del file target:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Un PDF per immagine:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Risposta di Esempio (Combinata) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Risposta di Esempio (Non Combinata) {#example-response-non-collated}

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

## Risposta di Esempio (Con Dimensione Target) {#example-response-with-target-size}

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

## Note {#notes}

- Le immagini vengono centrate sulla pagina e scalate per adattarsi ai margini preservando le proporzioni. Le immagini non vengono mai ingrandite.
- Quando `collate` è `false`, ogni immagine diventa un file PDF separato, e il download è un archivio ZIP contenente tutti i PDF.
- La funzione di dimensione target usa una ricerca binaria iterativa sui livelli di qualità JPEG (10-95) per trovare la migliore qualità che rientra nel budget.
- Le immagini trasparenti vengono appiattite su bianco prima dell'incorporamento nel PDF.
- Formati di input supportati: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG e altri.
- L'orientamento EXIF viene applicato automaticamente prima dell'incorporamento.
