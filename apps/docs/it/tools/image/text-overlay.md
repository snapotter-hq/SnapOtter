---
description: "Aggiunge sovrapposizioni di testo stilizzate con ombre esterne e riquadri di sfondo."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 2b43a5b19484
---

# Sovrapposizione di testo {#text-overlay}

Aggiunge testo stilizzato alle immagini con ombra esterna e riquadro di sfondo semitrasparente opzionali. Adatto per titoli, didascalie o annotazioni sulle foto.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| text | string | Sì | - | Testo da sovrapporre (da 1 a 500 caratteri) |
| fontSize | number | No | `48` | Dimensione del carattere in pixel (da 8 a 200) |
| color | string | No | `"#FFFFFF"` | Colore del testo in formato esadecimale (`#RRGGBB`) |
| position | string | No | `"bottom"` | Posizionamento verticale: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | Mostra un rettangolo di sfondo semitrasparente dietro il testo |
| backgroundColor | string | No | `"#000000"` | Colore del riquadro di sfondo in formato esadecimale (`#RRGGBB`) |
| shadow | boolean | No | `true` | Applica un'ombra esterna dietro il testo |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Con un riquadro di sfondo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Note {#notes}

- Il testo è sempre centrato orizzontalmente all'interno dell'immagine.
- L'ombra esterna usa uno scostamento di 2px con sfocatura di 3px al 70% di opacità nera.
- Il riquadro di sfondo copre l'intera larghezza dell'immagine al 70% di opacità, con altezza proporzionale alla dimensione del carattere (1.8x).
- Il testo viene renderizzato tramite composizione SVG, quindi viene usato il carattere sans-serif predefinito del sistema.
- I caratteri speciali XML nel testo vengono sottoposti a escape in modo sicuro.
- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
