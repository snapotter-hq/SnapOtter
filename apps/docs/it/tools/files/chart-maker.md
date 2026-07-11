---
description: "Crea grafici a barre, a linee o a torta da dati CSV o JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: f2f921e4fb62
---

# Chart Maker {#chart-maker}

Crea grafici a barre, a linee o a torta da dati CSV o JSON. Restituisce un'immagine PNG del grafico renderizzato.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Accetta dati form multipart con un file CSV o JSON e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | Tipo di grafico: `bar`, `line`, `pie` |
| title | string | No | - | Titolo del grafico (massimo 120 caratteri) |
| width | integer | No | `960` | Larghezza del grafico in pixel (320-2048) |
| height | integer | No | `540` | Altezza del grafico in pixel (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- L'input deve essere un file `.csv` o `.json`. I file CSV dovrebbero avere una riga di intestazione con i nomi delle colonne.
- La prima colonna viene usata come etichetta di categoria; la seconda colonna deve essere numerica e fornisce i valori dei dati. Vengono usate solo due colonne.
- L'input JSON dovrebbe essere un array di oggetti `{label, value}`, oppure un oggetto semplice le cui chiavi diventano etichette e i cui valori diventano punti dati.
- Massimo 100 punti dati. Tutti i valori devono essere maggiori o uguali a zero.
- L'output è sempre un'immagine PNG indipendentemente dal formato di input.
