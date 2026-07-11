---
description: "Simula come appaiono le immagini alle persone con diversi tipi di deficit della visione dei colori."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 323b587af4dd
---

# Simulazione di daltonismo {#color-blindness-simulation}

Simula il deficit della visione dei colori (CVD) per vedere in anteprima come appaiono le immagini alle persone con vari tipi di daltonismo. Utile per i test di accessibilità di design, grafici e UI.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| simulationType | string | No | `"deuteranomaly"` | Tipo di deficit della visione dei colori da simulare |

### Tipi di simulazione {#simulation-types}

| Valore | Condizione | Descrizione |
|-------|-----------|-------------|
| `protanopia` | Cecità al rosso | Assenza completa dei coni per il rosso |
| `deuteranopia` | Cecità al verde | Assenza completa dei coni per il verde |
| `tritanopia` | Cecità al blu | Assenza completa dei coni per il blu |
| `protanomaly` | Debolezza al rosso | Sensibilità ridotta dei coni per il rosso |
| `deuteranomaly` | Debolezza al verde | Sensibilità ridotta dei coni per il verde (la più comune) |
| `tritanomaly` | Debolezza al blu | Sensibilità ridotta dei coni per il blu |
| `achromatopsia` | Daltonismo totale | Assenza completa della visione dei colori |
| `blueConeMonochromacy` | Solo coni per il blu | Solo i coni per il blu funzionanti |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Note {#notes}

- La deuteranomalia (debolezza al verde) è l'impostazione predefinita perché è la forma più comune di deficit della visione dei colori, che interessa circa il 6% dei maschi.
- La simulazione usa matrici di trasformazione dei colori che modellano come i fotorecettori a coni ridotti o assenti alterano i colori percepiti.
- Questo strumento è non distruttivo e produce solo un'anteprima. Non modifica l'immagine originale per l'accessibilità.
- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
