---
description: "Applica immagini di firma caricate su un PDF usando posizionamenti normalizzati per pagina."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: da0e3b7725e0
---

# Firma PDF {#sign-pdf}

Applica una o più immagini di firma PNG caricate su qualsiasi pagina di un PDF. Questa route usa un contratto multipart personalizzato perché necessita del PDF, di una o più immagini di firma e delle coordinate di posizionamento.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Accetta dati di form multipart. Il PDF viene inviato come `file`; le firme vengono inviate come `sig0`, `sig1`, e così via; i posizionamenti vengono inviati in un campo JSON `placements`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File PDF da firmare |
| sig0 | file | Yes | - | Prima immagine di firma. Le immagini aggiuntive usano `sig1`, `sig2`, e così via |
| placements | JSON string | Yes | - | Array di oggetti di posizionamento: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | UUID opzionale per il monitoraggio dell'avanzamento tramite SSE |
| fileId | string | No | - | ID opzionale della libreria file per salvare il risultato firmato come nuova versione |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | Indice dell'immagine di firma. `0` corrisponde a `sig0` |
| page | integer | Indice di pagina PDF a base zero |
| x | number | Posizione sinistra come frazione della pagina |
| y | number | Posizione superiore come frazione della pagina |
| w | number | Larghezza della firma come frazione della pagina |
| h | number | Altezza della firma come frazione della pagina |

Le coordinate usano un'origine in alto a sinistra. I valori possono sconfinare leggermente oltre il bordo della pagina; il renderer PDF ritaglia il timbro finale alla pagina.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Se la richiesta non riesce a completarsi entro la finestra di attesa sincrona, l'API restituisce:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Connettiti a `/api/v1/jobs/<jobId>/progress` e scarica il risultato quando il job è completato.

## Notes {#notes}

- Formato di input PDF accettato: `.pdf`.
- Le immagini di firma devono essere file immagine validi, tipicamente PNG con trasparenza.
- Sono accettate fino a 100 immagini di firma e 100 posizionamenti.
- `sign-pdf` è una route personalizzata e non usa il campo JSON standard `settings` dello strumento.
