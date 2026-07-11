---
description: "Aggiunge un effetto vignettatura con intensità, colore e posizione regolabili."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 2cd9e87de6d2
---

# Vignettatura {#vignette}

Aggiunge un effetto vignettatura che scurisce o tinge i bordi di un'immagine. Supporta intensità, colore, raggio, morbidezza, rotondità e posizione del centro regolabili.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | Opacità della vignettatura (0.1-1) |
| color | string | No | `"#000000"` | Colore esadecimale della vignettatura |
| radius | integer | No | `70` | Raggio esterno come percentuale della semi-diagonale (0-100) |
| softness | integer | No | `50` | Morbidezza della sfumatura (0-100); valori più alti producono una dissolvenza più graduale |
| roundness | integer | No | `100` | Forma: 100 = cerchio, 0 = ellisse conforme alle proporzioni dell'immagine |
| centerX | integer | No | `50` | Posizione orizzontale del centro in percentuale (0-100) |
| centerY | integer | No | `50` | Posizione verticale del centro in percentuale (0-100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Note {#notes}

- Un `radius` più piccolo scurisce una porzione maggiore dell'immagine; un raggio più grande confina la vignettatura ai bordi estremi.
- Usa un `color` non nero (ad esempio toni bianchi o seppia) per effetti di vignettatura creativi.
- Regolare `centerX` e `centerY` ti permette di posizionare l'area libera fuori centro, utile per attirare l'attenzione su un soggetto che non si trova al centro dell'inquadratura.
- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
