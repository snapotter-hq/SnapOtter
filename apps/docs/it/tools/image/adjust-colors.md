---
description: "Regola luminosità, contrasto, saturazione, temperatura, tonalità, canali e applica effetti cromatici."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 79810efa7b49
---

# Regola colori {#adjust-colors}

Strumento completo di regolazione del colore che combina luminosità, contrasto, esposizione, saturazione, temperatura, tinta, rotazione di tonalità, livelli per singolo canale ed effetti a un clic (scala di grigi, seppia, inversione) in un unico endpoint.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Regolazione della luminosità (da -100 a 100) |
| contrast | number | No | `0` | Regolazione del contrasto (da -100 a 100) |
| exposure | number | No | `0` | Esposizione / gamma dei mezzitoni (da -100 a 100) |
| saturation | number | No | `0` | Saturazione del colore (da -100 a 100) |
| temperature | number | No | `0` | Bilanciamento del bianco: freddo/blu verso caldo/arancione (da -100 a 100) |
| tint | number | No | `0` | Spostamento della tinta: verde verso magenta (da -100 a 100) |
| hue | number | No | `0` | Rotazione della tonalità in gradi (da -180 a 180) |
| sharpness | number | No | `0` | Intensità della nitidezza (da 0 a 100) |
| red | number | No | `100` | Livello del canale rosso (da 0 a 200, 100 = invariato) |
| green | number | No | `100` | Livello del canale verde (da 0 a 200, 100 = invariato) |
| blue | number | No | `100` | Livello del canale blu (da 0 a 200, 100 = invariato) |
| effect | string | No | `"none"` | Effetto cromatico: `none`, `grayscale`, `sepia`, `invert` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Applica un aspetto vintage caldo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Note {#notes}

- Tutti i parametri hanno come valore predefinito quello neutro, così puoi regolare solo ciò che ti serve.
- Le regolazioni vengono applicate in quest'ordine: luminosità, contrasto, esposizione, saturazione/tonalità, temperatura/tinta, nitidezza, canali, effetti.
- La temperatura usa una matrice di ricombinazione del colore 3x3 sugli assi blu-arancione e verde-magenta.
- L'esposizione è mappata sulla funzione gamma di Sharp (valori positivi schiariscono i mezzitoni, valori negativi li scuriscono).
- Questo endpoint risponde anche ai percorsi legacy `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` e `/api/v1/tools/image/color-effects`. Tutti usano lo stesso schema.
- Il formato di output corrisponde a quello di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
