---
description: "Cattura pagine web o snippet HTML come immagini di alta qualità con emulazione dei dispositivi."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 5088dc063770
i18n_hash_version: 2
---

# HTML in Immagine {#html-to-image}

Cattura un URL di una pagina web o contenuto HTML grezzo come immagine screenshot. Supporta l'emulazione dei dispositivi (desktop, tablet, mobile), la cattura dell'intera pagina e più formati di output.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Accetta un **corpo JSON** (non multipart). Non è necessario alcun caricamento di file.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| url | string | Condizionale | - | URL da catturare (deve essere un URL valido) |
| html | string | Condizionale | - | Contenuto HTML grezzo da renderizzare (da 1 a 5.000.000 caratteri) |
| format | string | No | `"png"` | Formato di output: `jpg`, `png`, `webp` |
| quality | number | No | `90` | Qualità dell'output per formati con perdita (da 1 a 100) |
| fullPage | boolean | No | `false` | Cattura l'intera pagina scorrevole, non solo il viewport |
| devicePreset | string | No | `"desktop"` | Emulazione del dispositivo: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | No | `1280` | Larghezza personalizzata del viewport in pixel (da 320 a 3840, usata quando devicePreset è `custom`) |
| viewportHeight | number | No | `720` | Altezza personalizzata del viewport in pixel (da 320 a 2160, usata quando devicePreset è `custom`) |
| clientJobId | string | No | - | Un tuo ID del job, così puoi aprire lo stream di avanzamento prima che arrivi la risposta |

Deve essere fornito `url` oppure `html`, ma non entrambi.

### Preset dei Dispositivi {#device-presets}

| Preset | Larghezza | Altezza | UA Mobile |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | No |
| `tablet` | 768 | 1024 | No |
| `mobile` | 375 | 812 | Sì |
| `custom` | (specificato dall'utente) | (specificato dall'utente) | No |

## Richiesta di Esempio {#example-request}

Cattura una pagina web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Renderizza contenuto HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Risposta di Esempio {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### Pagine lente {#slow-pages}

La cattura viene eseguita come job in coda. Una cattura che termina entro la finestra di attesa sincrona risponde `200` con il risultato sopra. Una più lenta risponde `202` con un ID del job:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Segui `progressUrl` (Server-Sent Events) finché il job non termina. L'evento di completamento contiene lo stesso oggetto risultato della risposta `200`. Puoi annullare il job con `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Modificato dopo la 2.3.0
Fino alla 2.3.0 questo endpoint teneva sempre aperta la richiesta fino al termine della cattura e rispondeva `200`. Gli script che gestiscono solo `200` dovrebbero gestire anche `202`.
:::

## Note {#notes}

- Richiede che Chromium sia installato sul server. Restituisce HTTP 503 se il servizio del browser non è disponibile.
- Gli URL vengono validati contro attacchi SSRF (gli indirizzi di rete privati/interni sono bloccati).
- Questo endpoint è soggetto a un limite di 120 richieste all'ora.
- `originalSize` è sempre 0 poiché questo strumento genera immagini da URL/HTML.
- Il nome file di output è `screenshot.<format>`.
- Se il caricamento della pagina richiede troppo tempo, la cattura fallisce con HTTP 504 (gateway timeout).
- Se il servizio del browser va in crash ripetutamente, viene temporaneamente disabilitato e la cattura fallisce con HTTP 503 e codice `BROWSER_CRASHED`.
- Un crash del browser (HTTP 503) viene ritentato una volta prima di segnalare l'errore, come per gli altri job di immagini in coda. Un timeout di caricamento della pagina non viene ritentato.
- Una cattura che ha già risposto `202` segnala un errore sul proprio stream di avanzamento invece che nello stato HTTP.
