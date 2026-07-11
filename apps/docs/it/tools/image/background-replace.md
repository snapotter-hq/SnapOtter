---
description: "Sostituisce lo sfondo dell'immagine con un colore pieno o un gradiente usando l'IA."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 53618a2fe839
---

# Sostituzione sfondo {#background-replace}

Sostituisce lo sfondo di un'immagine con un colore pieno o un gradiente. Il modello di IA rileva il soggetto, rimuove lo sfondo originale e compone il soggetto sullo sfondo scelto.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | Modalità sfondo: `color` o `gradient` |
| color | string | No | `"#ffffff"` | Colore esadecimale dello sfondo (quando backgroundType è `color`) |
| gradientColor1 | string | No | - | Primo colore esadecimale del gradiente |
| gradientColor2 | string | No | - | Secondo colore esadecimale del gradiente |
| gradientAngle | integer | No | `180` | Angolo del gradiente in gradi (0-360) |
| feather | integer | No | `0` | Raggio di sfumatura dei bordi (0-20) |
| format | string | No | `"png"` | Formato di output: `png` o `webp` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
- L'output è predefinito a PNG per preservare la trasparenza attorno al soggetto.
