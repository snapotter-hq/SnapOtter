---
description: "Converte i file SVG in PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF o JXL a risoluzione e DPI personalizzati, con supporto batch."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: fe5acfd165cb
---

# SVG in raster {#svg-to-raster}

Converte i file SVG in formati immagine raster (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF o JXL) a risoluzione e DPI personalizzati. Supporta anche la conversione batch di più SVG.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Larghezza target in pixel (da 1 a 65536). Mantiene le proporzioni se è impostata una sola dimensione. |
| height | integer | No | - | Altezza target in pixel (da 1 a 65536). Mantiene le proporzioni se è impostata una sola dimensione. |
| dpi | integer | No | 300 | DPI di rendering, controlla la densità di rasterizzazione di base (da 36 a 2400) |
| quality | number | No | 90 | Qualità dell'output per i formati con perdita (da 1 a 100) |
| backgroundColor | string | No | `"#00000000"` | Colore di sfondo in esadecimale (6 o 8 caratteri, 8 caratteri include l'alfa) |
| outputFormat | string | No | `"png"` | Formato di output: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Endpoint batch {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Converte più file SVG in un'unica richiesta. Restituisce un archivio ZIP.

### Parametri batch aggiuntivi {#additional-batch-parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | ID processo opzionale fornito dal client per il tracciamento dell'avanzamento (max 128 caratteri) |

### Esempio di richiesta batch {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Risposta batch {#batch-response}

L'endpoint batch trasmette un file ZIP direttamente con le intestazioni:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Note {#notes}

- Accetta solo file SVG e SVGZ (verifica il contenuto, non solo l'estensione). I file SVGZ vengono decompressi automaticamente.
- Il contenuto SVG viene sanificato prima del rendering per prevenire XSS e il caricamento di risorse esterne.
- L'impostazione `dpi` controlla la densità con cui l'SVG viene rasterizzato. Un DPI più alto produce dimensioni in pixel maggiori dallo stesso viewport SVG.
- Quando vengono forniti sia `width` sia `height`, l'immagine viene ridimensionata usando `fit: inside` (mantiene le proporzioni entro i limiti).
- Nella risposta è incluso un `previewUrl` per i formati che i browser non possono visualizzare in modo nativo (TIFF, HEIF). L'anteprima è una miniatura WebP di 1200px.
- Lo sfondo `#00000000` predefinito è completamente trasparente. Impostalo su `#FFFFFF` per uno sfondo bianco (utile con l'output JPEG che non supporta la trasparenza).
- L'elaborazione batch rispetta la configurazione del server `MAX_BATCH_SIZE` e usa worker concorrenti per le prestazioni.
- L'avanzamento delle operazioni batch può essere tracciato tramite SSE su `/api/v1/jobs/:jobId/progress`.
