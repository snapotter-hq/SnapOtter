---
description: "Analizza le immagini alla ricerca di codici QR, codici a barre e codici 2D con output annotato."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 8068fbb792d3
---

# Lettore di codici a barre {#barcode-reader}

Analizza le immagini caricate alla ricerca di tutti i tipi di codici a barre e codici QR. Restituisce il testo decodificato, il tipo di codice a barre e i dati di posizione per ogni codice rilevato. Genera inoltre un'immagine annotata con riquadri colorati attorno ai codici rilevati.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Accetta dati di form multipart con un file immagine e un campo JSON opzionale `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | Abilita la modalità di scansione aggressiva per codici a barre più difficili da leggere (più lenta ma più approfondita) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Esempio di risposta {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Campi della risposta {#response-fields}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| filename | string | Nome del file originale |
| barcodes | array | Array di oggetti codice a barre rilevati |
| annotatedUrl | string o null | URL per scaricare l'immagine annotata (null se non viene trovato alcun codice a barre) |
| previewUrl | string o null | Uguale a annotatedUrl (per compatibilità con l'anteprima del frontend) |

### Oggetto codice a barre {#barcode-object}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| type | string | Formato del codice a barre (QRCode, EAN-13, Code128, DataMatrix, PDF417, ecc.) |
| text | string | Contenuto decodificato del codice a barre |
| position | object | Riquadro delimitante con coordinate topLeft, topRight, bottomLeft, bottomRight |

## Tipi di codici a barre supportati {#supported-barcode-types}

Codici a barre 1D: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Codici a barre 2D: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Note {#notes}

- Usa la libreria zxing-wasm per il rilevamento dei codici a barre.
- L'immagine annotata sovrappone riquadri poligonali colorati ed etichette numerate su ciascun codice a barre rilevato.
- È possibile rilevare fino a 255 codici a barre in una singola immagine.
- Se non viene trovato alcun codice a barre, `barcodes` è un array vuoto e `annotatedUrl` è null.
- La modalità `tryHarder` esegue una scansione più approfondita a costo di un maggior tempo di elaborazione. Disabilitala per un'elaborazione più veloce di codici a barre puliti e ben allineati.
- L'output annotato è sempre in formato PNG.
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima della scansione.
- L'orientamento EXIF viene applicato automaticamente prima dell'elaborazione.
