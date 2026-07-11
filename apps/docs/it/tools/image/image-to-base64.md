---
description: "Converti immagini in data URI Base64 per l'incorporamento in HTML, CSS e altro."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 753b30de9188
---

# Immagine in Base64 {#image-to-base64}

Converti una o più immagini in stringhe codificate in Base64 e data URI. Supporta la conversione facoltativa del formato, il controllo della qualità e il ridimensionamento. Utile per incorporare immagini direttamente in HTML, CSS, JSON o template di email.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Accetta dati di form multipart con una o più immagini e un campo JSON `settings` opzionale.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"original"` | Converti prima della codifica: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | No | `80` | Qualità dell'output per formati con perdita (da 1 a 100) |
| maxWidth | number | No | `0` | Larghezza massima in pixel (0 = nessun ridimensionamento, non ingrandirà) |
| maxHeight | number | No | `0` | Altezza massima in pixel (0 = nessun ridimensionamento, non ingrandirà) |

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Più file:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Risposta di Esempio {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Campi della Risposta {#response-fields}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| results | array | Immagini convertite con successo |
| errors | array | Immagini che non è stato possibile elaborare (con nome file e messaggio di errore) |

### Oggetto Result {#result-object}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| filename | string | Nome file originale |
| mimeType | string | Tipo MIME dell'output codificato |
| width | number | Larghezza finale in pixel (dopo eventuale ridimensionamento) |
| height | number | Altezza finale in pixel (dopo eventuale ridimensionamento) |
| originalSize | number | Dimensione del file originale in byte |
| encodedSize | number | Dimensione della stringa Base64 in byte |
| overheadPercent | number | Differenza percentuale di dimensione rispetto all'originale (positivo = più grande, negativo = più piccolo) |
| base64 | string | Dati grezzi dell'immagine codificati in Base64 |
| dataUri | string | Data URI completo pronto per l'uso negli attributi `src` |

## Note {#notes}

- La codifica Base64 in genere aumenta la dimensione di circa il 33% rispetto al file binario. Il campo `overheadPercent` mostra la differenza effettiva.
- Quando `outputFormat` è `"original"`, i file HEIC/HEIF vengono convertiti in JPEG (poiché i browser non possono visualizzare HEIC nei data URI).
- Le opzioni `maxWidth` e `maxHeight` ridimensionano usando `fit: inside` con `withoutEnlargement`, quindi le immagini più piccole delle dimensioni specificate non vengono ingrandite.
- È possibile elaborare più file in una singola richiesta. Ogni file viene elaborato in modo indipendente, e i fallimenti non impediscono la riuscita degli altri file.
- I file SVG vengono passati direttamente come `image/svg+xml` senza ricodifica (a meno che non venga richiesta una conversione di formato).
- Questo è un endpoint di sola lettura. Non produce un file scaricabile né un `jobId`. I dati Base64 vengono restituiti direttamente nel corpo della risposta.
