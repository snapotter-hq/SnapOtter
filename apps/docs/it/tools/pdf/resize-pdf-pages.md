---
description: "Ridimensiona ogni pagina di un PDF in A4, Letter, un'etichetta di spedizione 4x6 in o una dimensione personalizzata."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 6ca37d796d2c
i18n_hash_version: 2
---

# Ridimensiona le pagine di un PDF {#resize-pdf-pages}

Cambia la dimensione di ogni pagina di un PDF. Il contenuto viene scalato per adattarsi alla nuova pagina e centrato, così testo, grafica vettoriale e codici a barre restano nitidi. Usalo per trasformare un'etichetta di spedizione in una pagina 4x6 in per una stampante termica, o per portare un documento da A4 a US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Accetta dati form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | Dimensione di destinazione: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` o `custom` |
| width | number | No | `4` | Larghezza di pagina personalizzata, usata quando `pageSize` è `custom` |
| height | number | No | `6` | Altezza di pagina personalizzata, usata quando `pageSize` è `custom` |
| unit | string | No | `"in"` | Unità della dimensione personalizzata: `in` o `mm` |
| keepOrientation | boolean | No | `false` | Ruota la dimensione di destinazione per seguire l'orientamento di ogni pagina invece di forzare larghezza per altezza |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Le pagine vengono scalate per adattarsi, mai deformate. Quando le proporzioni sono diverse, lo spazio che avanza resta vuoto.
- Il ridimensionamento non ritaglia. Un'etichetta stampata su un quarto di una pagina Letter o A4 occupa comunque solo un quarto della nuova pagina.
- Le dimensioni personalizzate devono essere comprese tra 0,5 e 200 in (12,7-5080 mm) su ogni lato.
- La pagina viene ridimensionata a partire dal suo riquadro di ritaglio, se ne ha uno, quindi una pagina ritagliata mantiene solo l'area ritagliata.
