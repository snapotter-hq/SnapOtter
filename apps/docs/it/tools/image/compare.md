---
description: "Confronta due immagini fianco a fianco con visualizzazione delle differenze a livello di pixel e punteggio di somiglianza."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: dde034d93fcb
---

# Confronto immagini {#image-compare}

Carica due immagini per calcolare una mappa delle differenze a livello di pixel e una percentuale numerica di somiglianza. L'output è un'immagine delle differenze che evidenzia in rosso le regioni cambiate.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/compare`

Accetta dati di form multipart con **due** file immagine. Non è necessario alcun campo di impostazioni.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Carica esattamente due file immagine.

| Campo | Tipo | Obbligatorio | Descrizione |
|-------|------|----------|-------------|
| file (primo) | file | Sì | La prima immagine |
| file (secondo) | file | Sì | La seconda immagine |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Campi della risposta {#response-fields}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| jobId | string | Identificatore del job per scaricare l'immagine delle differenze |
| similarity | number | Percentuale di somiglianza tra le due immagini (da 0 a 100) |
| dimensions | object | Larghezza e altezza usate per il confronto |
| downloadUrl | string | URL per scaricare l'immagine delle differenze generata |
| originalSize | number | Dimensione combinata di entrambe le immagini di input in byte |
| processedSize | number | Dimensione dell'immagine di output delle differenze in byte |

## Note {#notes}

- Entrambe le immagini vengono ridimensionate alle stesse dimensioni (il massimo di ciascun asse) prima del confronto.
- L'immagine delle differenze evidenzia le differenze in rosso con opacità proporzionale all'entità del cambiamento. I pixel identici o quasi identici (differenza < 10) vengono mostrati come versioni semitrasparenti dell'originale.
- La somiglianza è calcolata come l'inverso della differenza media dei pixel su tutti i pixel, espressa in percentuale.
- Una somiglianza del 100% significa che le immagini sono identiche a livello di pixel (alla risoluzione di confronto).
- L'output delle differenze è sempre in formato PNG indipendentemente dai formati di input.
- Entrambe le immagini vengono validate e decodificate (HEIC, RAW, PSD, SVG supportati) prima del confronto.
- L'orientamento EXIF viene applicato automaticamente su entrambe le immagini prima dell'elaborazione.
