---
description: "Unisce le immagini affiancate, impilate o in griglia con controllo su allineamento, spazi, bordi e modalità di ridimensionamento."
i18n_source_hash: 39333210505a
i18n_provenance: human
i18n_output_hash: bf3eaa505310
---

# Unisci / Combina {#stitch-combine}

Unisce più immagini affiancate, impilate verticalmente o disposte in una griglia. Supporta allineamento, spazio, bordo, raggio degli angoli e diverse modalità di ridimensionamento.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | Direzione del layout: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | Numero di colonne quando la direzione è `grid` (da 2 a 100) |
| resizeMode | string | No | `"fit"` | Come vengono ridimensionate le immagini: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | Allineamento trasversale: `start`, `center`, `end` |
| gap | number | No | 0 | Spazio tra le immagini in pixel (da 0 a 1000) |
| border | number | No | 0 | Larghezza del bordo esterno in pixel (da 0 a 500) |
| cornerRadius | number | No | 0 | Raggio degli angoli applicato all'output finale (da 0 a 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Colore di sfondo/bordo in esadecimale (ad esempio `#FF0000`) |
| format | string | No | `"png"` | Formato di output: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Qualità dell'output (da 1 a 100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Note {#notes}

- Richiede almeno 2 immagini. Carica più file immagine nella richiesta multipart.
- Supporta i formati di input HEIC, RAW, PSD e SVG (decodificati automaticamente).
- Modalità di ridimensionamento:
  - `fit` - Scala le immagini per corrispondere alla dimensione minima lungo l'asse di unione.
  - `original` - Mantiene le dimensioni originali (può produrre bordi irregolari).
  - `stretch` - Forza le immagini a corrispondere alla dimensione minima senza preservare le proporzioni.
  - `crop` - Ritaglia le immagini con copertura per corrispondere alla dimensione minima.
- In modalità `grid`, le celle vengono dimensionate secondo le dimensioni mediane di tutte le immagini.
- Il `cornerRadius` viene applicato all'intero output finale, non alle singole immagini.
- La dimensione della tela è limitata dalla configurazione del server `MAX_CANVAS_PIXELS` per evitare l'esaurimento della memoria.
