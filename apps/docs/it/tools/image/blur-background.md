---
description: "Sfoca lo sfondo mantenendo il soggetto nitido usando l'IA."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 06510f368d1c
---

# Sfoca sfondo {#blur-background}

Sfoca lo sfondo di un'immagine mantenendo il soggetto nitido. Il modello di IA isola il soggetto, applica una sfocatura allo sfondo originale e compone il soggetto nitido sopra di esso.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| intensity | integer | No | `50` | Intensità della sfocatura (1-100) |
| feather | integer | No | `0` | Raggio di sfumatura dei bordi (0-20) |
| format | string | No | `"png"` | Formato di output: `png` o `webp` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Monitora l'avanzamento tramite SSE su `GET /api/v1/jobs/{jobId}/progress`. Al completamento del job, lo stream SSE emette un evento `completed` con l'URL di download.

## Note {#notes}

- Questo è uno strumento basato su IA che restituisce `202 Accepted` ed elabora in modo asincrono. Connettiti all'endpoint SSE per ricevere gli aggiornamenti di avanzamento e il risultato finale.
- Richiede l'installazione del bundle di funzionalità **background-removal**. Restituisce `501` se il bundle non è disponibile.
- Valori di intensità più elevati producono un effetto di sfocatura più forte. Valori superiori a 80 creano una pronunciata separazione simile a un bokeh.
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
