---
description: "Rimuove i metadati EXIF, GPS, ICC e XMP dalle immagini per privacy e file di dimensioni più ridotte."
i18n_source_hash: e89147734fd0
i18n_provenance: human
i18n_output_hash: 5276921c50db
---

# Rimuovi metadati {#remove-metadata}

Rimuove i metadati EXIF, GPS, i profili colore ICC e i metadati XMP dalle immagini. Utile per la privacy (rimozione di coordinate GPS, informazioni sulla fotocamera) e per ridurre le dimensioni del file.

## Endpoint API {#api-endpoints}

### Rimuovi metadati {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Elabora l'immagine e restituisce una versione ripulita con i metadati selezionati rimossi.

### Ispeziona metadati {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Restituisce i metadati analizzati come JSON senza modificare l'immagine. Utile per visualizzare in anteprima quali metadati esistono prima della rimozione.

## Parametri (Rimozione) {#parameters-strip}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | Rimuove i dati EXIF (impostazioni della fotocamera, date, ecc.) |
| stripGps | boolean | No | `false` | Rimuove solo i dati GPS/di posizione |
| stripIcc | boolean | No | `false` | Rimuove il profilo colore ICC |
| stripXmp | boolean | No | `false` | Rimuove i metadati XMP (Adobe, IPTC) |
| stripAll | boolean | No | `true` | Rimuove tutti i metadati in una volta |

Quando `stripAll` è `true`, sovrascrive i singoli flag e rimuove tutto.

## Esempio di richiesta {#example-request}

Rimuovi tutti i metadati:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Rimuovi solo i dati GPS (mantieni informazioni sulla fotocamera e profilo colore):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Ispeziona i metadati senza modificare:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Esempio di risposta (Rimozione) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Esempio di risposta (Ispezione) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Note {#notes}

- L'immagine viene ricodificata nel suo formato originale dopo la rimozione. JPEG usa mozjpeg alla qualità 90, PNG usa il livello di compressione 9, WebP usa la qualità 85.
- La rimozione dei profili ICC può causare lievi variazioni di colore se l'immagine era contrassegnata con un profilo non sRGB. Usa `stripIcc: false` se la precisione del colore è importante.
- L'endpoint di ispezione analizza le coordinate GPS in valori decimali di latitudine/longitudine (con prefisso underscore) per comodità.
- Formati di input supportati: JPEG, PNG, WebP, AVIF, TIFF, GIF.
