---
description: "Genera un grafico dell'istogramma RGB con statistiche per canale da un'immagine."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 3543c0e34ca7
---

# Istogramma {#histogram}

Genera un grafico dell'istogramma RGB da un'immagine. Restituisce un'immagine PNG dell'istogramma insieme a statistiche per canale e dati grezzi dell'istogramma a 256 bin nel JSON della risposta.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| scale | string | No | `"linear"` | Scala dell'asse Y: `linear` o `log` |

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Risposta di Esempio {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Note {#notes}

- Il `downloadUrl` punta a un grafico dell'istogramma PNG renderizzato che mostra le distribuzioni R, G, B e di luminanza.
- `bins` contiene array grezzi di 256 valori per ogni canale (rosso, verde, blu, luminanza), adatti al rendering di visualizzazioni personalizzate.
- `stats` fornisce media, mediana e deviazione standard per ogni canale.
- `mean` e `max` sono campi abbreviati retrocompatibili.
- Usa la scala `log` quando l'istogramma è dominato da pochi picchi e vuoi vedere il dettaglio nei bin più bassi.
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'analisi.
