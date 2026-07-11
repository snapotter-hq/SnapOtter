---
description: "Genera un piccolo segnaposto immagine a bassa qualità con data URI Base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: b71af8bdf7b1
---

# Segnaposto LQIP {#lqip-placeholder}

Genera un piccolo segnaposto immagine a bassa qualità (LQIP) da un'immagine sorgente. Restituisce un piccolo file segnaposto insieme a un data URI Base64, un tag HTML `<img>` pronto all'uso e uno snippet CSS `background-image` per l'incorporamento immediato.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| width | integer | No | `16` | Larghezza target in pixel (4-64) |
| blur | number | No | `2` | Raggio di sfocatura per la strategia di sfocatura (0-20) |
| strategy | string | No | `"blur"` | Strategia del segnaposto: `blur`, `pixelate` o `solid` |
| format | string | No | `"webp"` | Formato di output: `webp`, `png` o `jpeg` |
| quality | integer | No | `50` | Qualità dell'output (1-100) |

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Risposta di Esempio {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Note {#notes}

- Il campo `dataUri` contiene il data URI completo, pronto per l'uso negli attributi `src` o nel CSS senza richieste aggiuntive.
- I campi `html` e `css` forniscono snippet pronti da copiare e incollare per i casi d'uso comuni.
- La strategia `blur` produce una miniatura morbida e sfocata. La strategia `pixelate` crea un mosaico a blocchi. La strategia `solid` restituisce un singolo colore mediato.
- Le dimensioni tipiche dei segnaposto sono di 200-500 byte, il che li rende adatti all'inserimento in linea direttamente nell'HTML.
- L'altezza viene calcolata automaticamente per preservare le proporzioni dell'immagine sorgente.
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
