---
description: "Dispone le pagine PDF per la piegatura in un libretto."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 613f9c5f7589
---

# Libretto PDF {#booklet-pdf}

Impagina le pagine per la stampa fronte-retro in modo che i fogli stampati possano essere piegati in un libretto.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Pagine per foglio: `2`, `4`, `6` o `8` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Note {#notes}

- Il valore predefinito `perSheet: 2` posiziona due pagine affiancate su ciascun foglio, ovvero il layout standard del libretto per la stampa fronte-retro.
- Le pagine bianche vengono aggiunte automaticamente se il numero totale di pagine non è un multiplo della dimensione del foglio.
- Stampa l'output fronte-retro con rilegatura sul lato corto, poi piega e pinza.
