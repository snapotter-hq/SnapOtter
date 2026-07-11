---
description: "Sovrappone un logo o un'immagine come filigrana con posizione, opacità e scala configurabili."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 136675af1018
---

# Filigrana immagine {#image-watermark}

Sovrappone un logo o un'immagine secondaria come filigrana su un'immagine di base. La filigrana viene scalata in relazione alla larghezza dell'immagine di base e posizionata in un angolo o al centro.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Accetta dati di form multipart con **due** file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | Posizionamento della filigrana: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | Percentuale di opacità della filigrana (da 0 a 100) |
| scale | number | No | `25` | Larghezza della filigrana come percentuale della larghezza dell'immagine principale (da 1 a 100) |

### Campi dei file {#file-fields}

| Nome del campo | Obbligatorio | Descrizione |
|------------|----------|-------------|
| file | Sì | L'immagine principale/di base |
| watermark | Sì | L'immagine della filigrana/del logo |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Note {#notes}

- Entrambe le immagini vengono validate e decodificate (HEIC, RAW, PSD, SVG supportati).
- La filigrana viene ridimensionata proporzionalmente in modo che la sua larghezza sia pari al `scale`% della larghezza dell'immagine principale.
- L'opacità viene applicata tramite una maschera alfa composta con fusione `dest-in`.
- Le posizioni agli angoli usano un margine di 20px dal bordo dell'immagine.
- Se l'immagine della filigrana ha trasparenza (ad esempio un logo PNG), questa viene preservata durante la composizione.
- L'orientamento EXIF viene applicato automaticamente su entrambe le immagini prima dell'elaborazione.
