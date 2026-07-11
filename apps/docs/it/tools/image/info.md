---
description: "Visualizza metadati dettagliati, proprietà e statistiche dell'istogramma per canale di un'immagine."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 7227ba3e7033
---

# Info Immagine {#image-info}

Strumento di analisi di sola lettura che restituisce metadati completi dell'immagine, incluse dimensioni, formato, spazio colore, presenza di EXIF/ICC/XMP e statistiche dell'istogramma per canale. Non produce un file di output elaborato.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/info`

Accetta dati di form multipart con un file immagine. Nessun campo di impostazioni necessario.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Basta caricare il file immagine.

| Campo | Tipo | Obbligatorio | Descrizione |
|-------|------|----------|-------------|
| file | file | Sì | L'immagine da analizzare |

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Risposta di Esempio {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Campi della Risposta {#response-fields}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| filename | string | Nome file sanificato |
| fileSize | number | Dimensione del file in byte |
| width | number | Larghezza dell'immagine in pixel |
| height | number | Altezza dell'immagine in pixel |
| format | string | Formato rilevato (jpeg, png, webp, ecc.) |
| channels | number | Numero di canali colore |
| hasAlpha | boolean | Se l'immagine ha un canale alpha |
| colorSpace | string | Spazio colore (srgb, cmyk, ecc.) |
| density | number o null | Risoluzione DPI/PPI |
| isProgressive | boolean | Se il JPEG usa la codifica progressiva |
| orientation | number o null | Valore di orientamento EXIF (1-8) |
| hasProfile | boolean | Se è incorporato un profilo ICC |
| hasExif | boolean | Se sono presenti metadati EXIF |
| hasIcc | boolean | Se è presente un profilo colore ICC |
| hasXmp | boolean | Se sono presenti metadati XMP |
| bitDepth | string o null | Bit per campione |
| pages | number | Numero di pagine (per formati multi-pagina come TIFF, GIF) |
| histogram | array | Statistiche per canale (min, max, media, deviazione standard) |

## Note {#notes}

- Questo è un endpoint di sola lettura. Non produce un file di output scaricabile né un `jobId`.
- Per le immagini in formato RAW (DNG, CR2, NEF, ARW, ecc.), ExifTool viene usato per estrarre le dimensioni reali del sensore e i flag dei metadati che Sharp non riesce a leggere direttamente.
- I file HEIC/HEIF vengono decodificati internamente in PNG per estrarre le statistiche dei pixel, poiché Sharp non riesce a decodificare i pixel HEVC.
- L'istogramma fornisce min/max/media/dev.std per canale, non una distribuzione completa a 256 bin.
- Il campo `density` riflette i metadati DPI incorporati, se presenti.
