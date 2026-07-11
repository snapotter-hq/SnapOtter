---
description: "Estrai i colori dominanti da un'immagine come palette di colori."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: ad7971282a1d
---

# Palette di colori {#color-palette}

Estrai i colori dominanti da un'immagine e restituiscili come valori esadecimali. Usa l'analisi di frequenza quantizzata per identificare i colori più prominenti e visivamente distinti.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Accetta dati di form multipart con un file immagine e un campo JSON `settings` opzionale.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| count | integer | No | `8` | Numero di colori da estrarre (2-16) |
| format | string | No | `"hex"` | Formato del colore: `hex`, `rgb`, `hsl` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Esempio di risposta {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Campi della risposta {#response-fields}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| filename | string | Nome del file sanificato |
| colors | array | Array di stringhe di colore nel formato richiesto, ordinate per dominanza (dal più frequente) |
| hex | array | Array di stringhe di colore esadecimali (sempre esadecimali, indipendentemente dall'impostazione `format`) |
| count | number | Numero di colori estratti |

## Note {#notes}

- Restituisce fino a `count` colori dominanti (predefinito 8, intervallo 2-16), ordinati per frequenza (dal più comune).
- L'immagine viene ridimensionata internamente a 100x100 pixel per l'analisi, quindi la palette rappresenta la distribuzione complessiva dei colori piuttosto che piccoli dettagli.
- I colori vengono estratti usando la quantizzazione median-cut, che divide ricorsivamente le popolazioni di pixel lungo il canale con l'intervallo più ampio.
- Il canale alfa viene rimosso prima dell'analisi, quindi le aree trasparenti non vengono considerate.
- Questo è un endpoint di sola lettura. Non produce un file di output scaricabile né un `jobId`.
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'analisi.
