---
description: "Crea meme con template o immagini personalizzate, caselle di testo stilizzate e opzioni per i font."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: e388bab0e131
---

# Meme Generator {#meme-generator}

Crea meme usando i template integrati o immagini personalizzate. Aggiungi testo con lo stile classico dei meme (testo in grassetto con contorno), diversi preset di layout e scelte di font.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Accetta uno tra:
- **Dati form multipart** con un file immagine e un campo JSON `settings` (modalità immagine personalizzata)
- **Corpo JSON** con un `templateId` (modalità template, senza bisogno di caricare un file)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | ID del template di meme integrato. Se fornito, non serve caricare un'immagine |
| textLayout | string | No | `"top-bottom"` | Layout delle caselle di testo: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | Array di oggetti casella di testo con i campi `id` e `text` |
| fontFamily | string | No | `"anton"` | Font: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | Dimensione del font in pixel (da 8 a 200). Calcolata automaticamente se omessa |
| textColor | string | No | `"#ffffff"` | Colore di riempimento del testo |
| strokeColor | string | No | `"#000000"` | Colore del contorno del testo |
| textAlign | string | No | `"center"` | Allineamento del testo: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | Converti il testo in maiuscolo |

### Text Boxes {#text-boxes}

Ogni voce nell'array `textBoxes` dovrebbe avere:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Identificatore della casella corrispondente al layout (ad es. `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Il testo del meme da visualizzare |

### Text Layout Box IDs {#text-layout-box-ids}

| Layout | Available Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request {#example-request}

Immagine personalizzata con testo in alto e in basso:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Usando un template integrato (corpo JSON, nessun file da caricare):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes {#notes}

- È richiesto o un `templateId` o un file immagine caricato. Se si forniscono entrambi, viene usato il template.
- I template definiscono le posizioni delle proprie caselle di testo; il parametro `textLayout` viene ignorato quando si usano i template.
- Il testo viene renderizzato come SVG con contorni per ottenere il classico look dei meme.
- La dimensione del font viene calcolata automaticamente per adattarsi alla casella di testo se non impostata esplicitamente.
- Le caselle di testo vuote vengono ignorate (non avviene alcun rendering se tutte le caselle sono vuote).
- Il nome file di output include l'ID del template quando si usano i template (ad es. `meme-drake.png`).
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
