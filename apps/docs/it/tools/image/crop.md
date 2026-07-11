---
description: "Ritaglia immagini specificando una regione con posizione e dimensioni."
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: 7f9ff6b77a1f
---

# Ritaglia {#crop}

Ritaglia immagini definendo una regione rettangolare usando posizione e dimensione. Supporta unità sia in pixel che in percentuale.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/crop`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| left | number | Sì | - | Offset X della regione di ritaglio (dal bordo sinistro) |
| top | number | Sì | - | Offset Y della regione di ritaglio (dal bordo superiore) |
| width | number | Sì | - | Larghezza della regione di ritaglio |
| height | number | Sì | - | Altezza della regione di ritaglio |
| unit | string | No | `"px"` | Unità per i valori: `px` o `percent` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Ritaglia usando valori percentuali:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Note {#notes}

- La regione di ritaglio deve rientrare nei confini dell'immagine. Se la regione si estende oltre l'immagine, la richiesta fallirà.
- Quando si usa l'unità `percent`, i valori rappresentano percentuali delle dimensioni dell'immagine (es. `left: 10` significa 10% dal bordo sinistro).
- Il formato di output corrisponde al formato di input.
- L'orientamento EXIF viene applicato automaticamente prima del ritaglio, quindi le coordinate corrispondono all'orientamento visivamente corretto.
