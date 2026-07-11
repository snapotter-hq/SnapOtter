---
description: "Miglioramento automatico con un clic che analizza un'immagine e corregge esposizione, contrasto, bilanciamento del bianco, saturazione e nitidezza."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 2fc15ab32ee6
---

# Miglioramento Immagine {#image-enhancement}

Miglioramento automatico con un clic e analisi intelligente. Analizza l'immagine e applica correzioni di esposizione, contrasto, bilanciamento del bianco, saturazione, nitidezza e riduzione del rumore.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Elaborazione:** Sincrona (usa la factory `createToolRoute`, restituisce il risultato direttamente)

**Model bundle:** Nessuno richiesto per il miglioramento di base. Il bundle `upscale-enhance` (5-6 GB) viene usato solo quando `deepEnhance` è abilitato (per la rimozione del rumore tramite IA con SCUNet).

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| mode | string | No | `"auto"` | Modalità di miglioramento: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | No | `50` | Intensità complessiva del miglioramento (0-100) |
| corrections | object | No | tutte `true` | Correzioni selettive da applicare (vedi sotto) |
| deepEnhance | boolean | No | `false` | Abilita la rimozione del rumore basata su IA (richiede lo strumento `noise-removal` installato) |

### Oggetto Corrections {#corrections-object}

| Campo | Tipo | Predefinito | Descrizione |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Correzione automatica dell'esposizione |
| contrast | boolean | `true` | Correzione automatica del contrasto |
| whiteBalance | boolean | `true` | Correzione automatica del bilanciamento del bianco |
| saturation | boolean | `true` | Correzione automatica della saturazione |
| sharpness | boolean | `true` | Nitidezza automatica |
| denoise | boolean | `true` | Riduzione leggera del rumore |

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Risposta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Endpoint Analyze {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analizza un'immagine e restituisce raccomandazioni di correzione senza applicarle.

### Parametri {#parameters-1}

| Parametro | Tipo | Obbligatorio | Descrizione |
|-----------|------|----------|-------------|
| file | file | Sì | File immagine (multipart) |

### Richiesta di Esempio {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Risposta (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Note {#notes}

- Questo strumento usa la factory sincrona `createToolRoute`, quindi restituisce una risposta standard (non 202 asincrona).
- Il parametro `mode` regola come vengono ponderate le correzioni (es. la modalità ritratto è più delicata sui toni della pelle, la modalità paesaggio aumenta la saturazione).
- Quando `deepEnhance` è abilitato e lo strumento `noise-removal` (SCUNet) è installato, viene applicata un'ulteriore passata di riduzione del rumore tramite IA dopo le correzioni standard.
- L'endpoint analyze è utile per visualizzare in anteprima quali correzioni verrebbero applicate prima di confermare.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
