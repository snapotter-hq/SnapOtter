---
description: "Genera codici a barre nei formati Code 128, EAN-13, UPC-A, Code 39, ITF-14 e Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: ca62ce96912b
---

# Generatore di codici a barre {#barcode-generator}

Genera immagini di codici a barre da testo in input. Supporta i formati Code 128, EAN-13, UPC-A, Code 39, ITF-14 e Data Matrix.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Accetta un corpo `application/json` (non multipart). Il codice a barre viene generato dal testo fornito, non da un file caricato.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| text | string | Sì | - | Testo da codificare nel codice a barre (1-256 caratteri) |
| type | string | No | `"code128"` | Formato del codice a barre: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | No | `3` | Fattore di scala dell'immagine (1-8) |
| includeText | boolean | No | `true` | Se rendere il testo sotto il codice a barre |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Note {#notes}

- A differenza della maggior parte degli strumenti, questo endpoint accetta un corpo JSON, non dati di form multipart, poiché i codici a barre vengono generati da testo anziché da un file caricato.
- EAN-13 richiede esattamente 12 o 13 cifre. UPC-A richiede esattamente 11 o 12 cifre. Se una cifra di controllo viene omessa, viene calcolata automaticamente.
- Code 128 è il formato più flessibile e supporta l'intero set di caratteri ASCII.
- Data Matrix produce un codice a barre 2D adatto a codificare stringhe più lunghe in un quadrato compatto.
