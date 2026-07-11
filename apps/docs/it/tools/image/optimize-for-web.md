---
description: "Ottimizza le immagini per il web con conversione di formato, controllo della qualità, ridimensionamento e rimozione dei metadati."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 4e01a6965381
---

# Optimize for Web {#optimize-for-web}

Ottimizza le immagini per la distribuzione sul web in un solo passaggio. Combina conversione di formato, regolazione della qualità, ridimensionamento opzionale, codifica progressiva e rimozione dei metadati.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Accetta dati form multipart con un file immagine e un campo JSON `settings`.

È disponibile anche un endpoint di anteprima in tempo reale su `POST /api/v1/tools/image/optimize-for-web/preview`, che restituisce l'immagine elaborata direttamente in formato binario (senza creare un workspace) per la regolazione dei parametri in tempo reale.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | Formato di output: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | Qualità dell'output (1-100) |
| maxWidth | number | No | - | Larghezza massima in pixel. L'immagine viene ridotta se più larga. |
| maxHeight | number | No | - | Altezza massima in pixel. L'immagine viene ridotta se più alta. |
| progressive | boolean | No | `true` | Abilita la codifica progressiva/interlacciata |
| stripMetadata | boolean | No | `true` | Rimuovi i metadati EXIF, GPS, ICC e XMP |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Ottimizza per AVIF con compressione aggressiva:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response {#preview-endpoint-response}

L'endpoint di anteprima (`/api/v1/tools/image/optimize-for-web/preview`) restituisce l'immagine binaria direttamente con header informativi:

- `X-Original-Size` - Dimensione del file originale in byte
- `X-Processed-Size` - Dimensione del file elaborato in byte
- `X-Output-Filename` - Nome file di output codificato in URL

## Notes {#notes}

- Questo strumento è progettato come una pipeline di ottimizzazione all-in-one per le risorse web. Gestisce conversione di formato, regolazione della qualità, limitazione delle dimensioni massime e rimozione dei metadati in un unico passaggio.
- L'estensione del nome file di output viene aggiornata per corrispondere al formato scelto.
- La codifica JXL (JPEG XL) usa un encoder CLI specializzato. L'immagine viene prima elaborata come PNG, poi codificata in JXL.
- La codifica progressiva migliora il tempo di caricamento percepito per JPEG e PNG, consentendo ai browser di renderizzare un'anteprima a bassa qualità prima che l'immagine completa sia caricata.
- L'endpoint di anteprima è più leggero (nessuna creazione di workspace/job) ed è destinato all'interfaccia di regolazione dei parametri in tempo reale del frontend.
