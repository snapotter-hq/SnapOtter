---
description: "Aggiunge filigrane di testo con posizione, opacità, rotazione e ripetizione a mosaico configurabili."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 543a5613c780
---

# Filigrana di testo {#text-watermark}

Aggiunge una sovrapposizione di filigrana di testo alle immagini. Supporta il posizionamento singolo agli angoli/al centro o la ripetizione a mosaico sull'intera immagine, con dimensione del carattere, colore, opacità e rotazione configurabili.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| text | string | Sì | - | Testo della filigrana (da 1 a 500 caratteri) |
| fontSize | number | No | `48` | Dimensione del carattere in pixel (da 8 a 1000) |
| color | string | No | `"#000000"` | Colore del testo in formato esadecimale (`#RRGGBB`) |
| opacity | number | No | `50` | Percentuale di opacità del testo (da 0 a 100) |
| position | string | No | `"center"` | Posizionamento: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | Angolo di rotazione del testo in gradi (da -360 a 360) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Filigrana a mosaico sull'intera immagine:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Note {#notes}

- La filigrana viene renderizzata come testo SVG e composta sull'immagine, preservando la qualità dell'output.
- La modalità a mosaico spazia gli elementi di testo in base alla dimensione del carattere (spaziatura orizzontale 6x, verticale 4x), con un limite massimo di 500 elementi.
- Per le posizioni agli angoli, il margine dal bordo è pari alla dimensione del carattere.
- Il carattere usato è il carattere sans-serif predefinito del sistema.
- I caratteri speciali XML nel testo (`&`, `<`, `>`, `"`, `'`) vengono sottoposti a escape in modo sicuro.
- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
