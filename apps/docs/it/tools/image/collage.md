---
description: "Combina più immagini in collage a griglia con oltre 25 modelli, spazi e angoli regolabili e pan e zoom per singola cella."
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: 6a2fb7cb8440
---

# Collage / Griglia {#collage-grid}

Combina più immagini in bellissimi collage a griglia con oltre 25 modelli. Supporta layout da 2 a 9 immagini con spazio, raggio degli angoli, colore di sfondo e controlli di pan/zoom per singola cella personalizzabili.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| templateId | string | Sì | - | ID del layout del modello (es. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | No | - | Array di impostazioni per singola cella con `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Sì | - | Indice dell'immagine da inserire in questa cella (in base 0) |
| cells[].panX | number | No | 0 | Offset di pan orizzontale (da -100 a 100) |
| cells[].panY | number | No | 0 | Offset di pan verticale (da -100 a 100) |
| cells[].zoom | number | No | 1 | Livello di zoom (da 1 a 10) |
| cells[].objectFit | string | No | `"cover"` | Come l'immagine riempie la cella: `cover` o `contain` |
| gap | number | No | 8 | Spazio tra le celle in pixel (da 0 a 500) |
| cornerRadius | number | No | 0 | Raggio degli angoli per ogni cella in pixel (da 0 a 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Colore di sfondo come esadecimale o `"transparent"` |
| aspectRatio | string | No | `"free"` | Proporzioni della tela: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | No | `"png"` | Formato di output: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Qualità di output (da 1 a 100) |

## Modelli disponibili {#available-templates}

| ID modello | Immagini | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | Due colonne uguali |
| `2-v-equal` | 2 | Due righe uguali |
| `2-h-left-large` | 2 | Sinistra 2/3, destra 1/3 |
| `2-h-right-large` | 2 | Sinistra 1/3, destra 2/3 |
| `3-left-large` | 3 | Grande a sinistra, due impilate a destra |
| `3-right-large` | 3 | Due impilate a sinistra, grande a destra |
| `3-top-large` | 3 | Grande in alto, due colonne in basso |
| `3-h-equal` | 3 | Tre colonne uguali |
| `3-v-equal` | 3 | Tre righe uguali |
| `4-grid` | 4 | Griglia 2x2 |
| `4-left-large` | 4 | Grande a sinistra, tre impilate a destra |
| `4-top-large` | 4 | Grande in alto, tre colonne in basso |
| `4-bottom-large` | 4 | Tre colonne in alto, grande in basso |
| `5-top2-bottom3` | 5 | Due in alto, tre in basso |
| `5-top3-bottom2` | 5 | Tre in alto, due in basso |
| `5-left-large` | 5 | Grande a sinistra, quattro impilate a destra |
| `5-center-large` | 5 | Grande al centro, quattro agli angoli |
| `6-grid-2x3` | 6 | 2 colonne x 3 righe |
| `6-grid-3x2` | 6 | 3 colonne x 2 righe |
| `6-top-large` | 6 | Grande in alto, cinque colonne in basso |
| `7-mosaic` | 7 | Layout a mosaico |
| `8-mosaic` | 8 | Layout a mosaico |
| `9-grid` | 9 | Griglia 3x3 |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Note {#notes}

- Carica più file immagine nella richiesta multipart. Le immagini vengono assegnate alle celle del modello nell'ordine di caricamento.
- Se vengono caricate più immagini di quante il modello ne supporti, le immagini in eccesso vengono ignorate.
- Supporta i formati di input HEIC, RAW, PSD e SVG (decodificati automaticamente).
- La dimensione base della tela è di 2400px sul lato più lungo, scalata in base alle proporzioni scelte.
- Quando `aspectRatio` è `"free"`, la tela usa come predefinito 4:3 (2400x1800).
- I valori `panX`/`panY` per singola cella spostano la finestra di ritaglio all'interno della cella. Un valore di 100 sposta completamente verso un bordo, -100 verso l'altro.
- Il colore di sfondo `"transparent"` viene preservato solo con i formati di output `png`, `webp` o `avif`.
