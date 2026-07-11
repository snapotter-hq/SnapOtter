---
description: "Converte tra JSON e XML, in entrambe le direzioni."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 96a157ce85e6
---

# JSON to XML {#json-to-xml}

Converte tra i formati JSON e XML in entrambe le direzioni. Carica un file JSON per ottenere XML, oppure carica un file XML per ottenere JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Accetta dati form multipart con un file JSON o XML e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Formatta l'output con indentazione |

## Example Request {#example-request}

JSON to XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- La direzione della conversione viene rilevata automaticamente dall'estensione del file di input: `.json` produce `.xml`, e `.xml` produce `.json`.
- Il parametro `pretty` si applica a entrambe le direzioni. Quando `false`, l'output è compatto senza indentazione.
- Gli attributi XML e le strutture annidate vengono preservati durante la conversione di andata e ritorno dove possibile.
