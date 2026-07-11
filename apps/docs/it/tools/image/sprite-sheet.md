---
description: "Combina più immagini in un'unica griglia sprite sheet con metadati per fotogramma."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 2a9d044ac3b7
---

# Sprite Sheet {#sprite-sheet}

Combina più immagini in un'unica griglia sprite sheet. Ogni immagine viene ridimensionata per corrispondere alle dimensioni della prima immagine e posizionata nella griglia. Restituisce l'immagine sprite sheet insieme ai metadati di coordinate per fotogramma.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Accetta dati di form multipart con due o più file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | Numero di colonne nella griglia (1-16) |
| padding | integer | No | `0` | Margine tra le celle in pixel (0-64) |
| background | string | No | `"#ffffff"` | Colore di sfondo esadecimale |
| format | string | No | `"png"` | Formato di output: `png`, `webp` o `jpeg` |
| quality | integer | No | `90` | Qualità dell'output (1-100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Note {#notes}

- Accetta da 2 a 64 immagini. Tutte le immagini vengono ridimensionate per corrispondere alle dimensioni della prima immagine caricata.
- L'array `frames` fornisce le coordinate esatte in pixel di ciascun fotogramma nell'output, adatte per definizioni di sprite CSS o mappe di fotogrammi di motori di gioco.
- Il numero di righe viene calcolato automaticamente in base al numero di immagini e al valore `columns`.
- Usa il parametro `padding` per aggiungere spaziatura tra le celle. Il colore `background` è visibile nelle aree di margine e in qualsiasi cella finale vuota.
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
