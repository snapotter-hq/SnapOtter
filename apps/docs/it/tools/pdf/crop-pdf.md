---
description: "Ritaglia tutte le pagine di un PDF con un margine per ogni bordo, margini separati per bordo o fino a un'area."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: ccfc71a720e0
i18n_hash_version: 2
---

# Ritaglia PDF {#crop-pdf}

Ritaglia tutte le pagine di un PDF con un unico margine su ogni bordo, un margine separato per ciascun bordo, oppure fino a un'area, come un'etichetta di spedizione stampata in un angolo del foglio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides` o `region` |
| margin | number | No | `20` | Modalità `uniform`: margine di ritaglio per ogni bordo in punti (0-2000) |
| top, right, bottom, left | number | No | `0` | Modalità `sides`: margine di ritaglio per ciascun bordo in punti (0-2000) |
| x, y | number | No | `0` | Modalità `region`: scostamento dell'area dal bordo sinistro e dal bordo superiore della pagina in punti |
| width, height | number | No | `288`, `432` | Modalità `region`: dimensioni dell'area in punti (un'etichetta 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Mantieni solo l'etichetta 4x6 in nell'angolo in alto a sinistra di ogni pagina:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Tutti i valori sono espressi in punti PDF (1 punto = 1/72 di pollice). Una pagina US Letter misura 612 x 792 punti.
- Ogni modalità legge solo i propri campi, quindi una richiesta che invia solo `margin` continua a funzionare.
- Un'area si misura dall'angolo in alto a sinistra di ogni pagina e deve rientrare in tutte le pagine. I margini devono lasciare una parte di ogni pagina. In caso contrario la richiesta fallisce con `400`.
- In una pagina impostata per essere visualizzata ruotata, posizioni e bordi si riferiscono alla pagina così come viene visualizzata, quindi l'angolo in alto a sinistra di un'area è l'angolo in alto a sinistra della pagina ruotata.
- Ogni modalità misura a partire dal media box completo, quindi ritagliare una pagina già ritagliata riparte dalla pagina intera. Un margine uniforme di `0` mostra l'intero media box.
