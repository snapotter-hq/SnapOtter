---
description: "Divide un'immagine in tessere a griglia per righe e colonne o per dimensione in pixel, restituite come archivio ZIP."
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: 1f01741aaff9
---

# Divisione immagine {#image-splitting}

Divide una singola immagine in tessere a griglia per numero di colonne/righe o per dimensioni specifiche in pixel. Restituisce un archivio ZIP contenente tutte le tessere.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | Numero di colonne in cui dividere (da 1 a 100) |
| rows | integer | No | 3 | Numero di righe in cui dividere (da 1 a 100) |
| tileWidth | integer | No | - | Larghezza della tessera in pixel (min 10). Sovrascrive `columns` quando sono impostati sia `tileWidth` sia `tileHeight`. |
| tileHeight | integer | No | - | Altezza della tessera in pixel (min 10). Sovrascrive `rows` quando sono impostati sia `tileWidth` sia `tileHeight`. |
| outputFormat | string | No | `"original"` | Formato di output per le tessere: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Qualità dell'output per i formati con perdita (da 1 a 100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Esempio di risposta {#example-response}

La risposta viene trasmessa direttamente come file ZIP con `Content-Type: application/zip`. Il nome del file segue lo schema `split-<jobId>.zip`.

Ogni tessera all'interno dello ZIP è denominata `<originalBaseName>_r<row>_c<col>.<ext>` (ad esempio `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Note {#notes}

- Accetta un singolo file immagine.
- Supporta i formati di input HEIC, RAW, PSD e SVG (decodificati automaticamente).
- Quando vengono forniti sia `tileWidth` sia `tileHeight`, hanno la priorità su `columns`/`rows`. Le dimensioni della griglia vengono calcolate come `ceil(imageWidth / tileWidth)` e `ceil(imageHeight / tileHeight)`.
- Le tessere di bordo (colonna più a destra, riga inferiore) possono essere più piccole della dimensione specificata se le dimensioni dell'immagine non sono divisibili in modo uniforme.
- La dimensione massima della griglia è limitata a 100x100 (10.000 tessere).
- La risposta trasmette lo ZIP direttamente, quindi non c'è un corpo di risposta JSON. Usa `--output` con curl per salvare il file.
