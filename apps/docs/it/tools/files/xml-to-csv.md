---
description: "Estrae elementi ripetuti da un XML in una tabella CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 502b4980705a
---

# Da XML a CSV {#xml-to-csv}

Estrae elementi ripetuti da un file XML in una tabella CSV piatta. Lo strumento trova automaticamente il primo array di oggetti nell'albero XML e mappa ogni elemento a una riga.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Accetta dati di form multipart con un file XML. Non è richiesto alcun campo di impostazioni.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. L'elemento ripetuto viene rilevato automaticamente dalla struttura XML.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Note {#notes}

- Sono accettati come input solo file `.xml`.
- Lo strumento analizza l'albero XML alla ricerca del primo insieme ripetuto di elementi fratelli e li usa come righe.
- Ogni nome univoco di elemento figlio o attributo diventa un'intestazione di colonna CSV.
- Questa è una conversione a senso unico. Per la conversione bidirezionale JSON/XML, usa lo strumento [Da JSON a XML](/it/tools/files/json-xml).
