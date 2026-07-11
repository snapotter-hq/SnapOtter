---
description: "Converte tra YAML e JSON, in entrambe le direzioni."
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: 88a1fe592187
---

# YAML / JSON {#yaml-json}

Converte tra i formati YAML e JSON in entrambe le direzioni. Carica un file YAML per ottenere JSON, oppure carica un file JSON per ottenere YAML.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Accetta dati di form multipart con un file YAML o JSON. Non è richiesto alcun campo di impostazioni.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. La direzione della conversione è determinata dall'estensione del file di input.

## Esempio di richiesta {#example-request}

Da YAML a JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

Da JSON a YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Note {#notes}

- La direzione della conversione viene rilevata automaticamente dall'estensione del file di input: `.yaml` o `.yml` produce `.json`, e `.json` produce `.yaml`.
- Sono accettate entrambe le estensioni `.yaml` e `.yml`.
- Viene convertito solo il primo documento in un file YAML multi-documento; i documenti aggiuntivi separati da `---` vengono ignorati.
