---
description: "Ritaglia un'immagine in un cerchio centrato con angoli trasparenti."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: cd71d5db62cd
---

# Ritaglio circolare {#circle-crop}

Ritaglia un'immagine in un cerchio centrato con angoli trasparenti. Supporta zoom, offset, bordo e dimensione di output regolabili.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | Fattore di zoom (1-5); valori più alti ritagliano più stretto |
| offsetX | number | No | `0.5` | Posizione orizzontale del centro (0-1) |
| offsetY | number | No | `0.5` | Posizione verticale del centro (0-1) |
| borderWidth | integer | No | `0` | Larghezza del bordo in pixel (0-200) |
| borderColor | string | No | `"#ffffff"` | Colore esadecimale del bordo |
| background | string | No | `"transparent"` | Riempimento degli angoli: `"transparent"` o un colore esadecimale |
| outputSize | integer | No | - | Dimensione finale quadrata in pixel (16-4096) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Note {#notes}

- L'output è sempre PNG per preservare gli angoli trasparenti (a meno che `background` non sia impostato su un colore pieno).
- Il cerchio è inscritto nella dimensione più corta dell'immagine. Usa `zoom` per ritagliare più stretto e `offsetX`/`offsetY` per spostare l'area visibile.
- Quando viene fornito `outputSize`, il risultato viene ridimensionato a quella dimensione quadrata dopo il ritaglio.
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
