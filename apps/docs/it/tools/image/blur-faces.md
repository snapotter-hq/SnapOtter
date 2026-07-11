---
description: "Rileva e sfoca automaticamente i volti nelle immagini con il rilevamento facciale basato su IA per la privacy e l'anonimizzazione conforme al GDPR."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: d32c51859f58
---

# Sfocatura volti / PII {#face-pii-blur}

Rileva e sfoca automaticamente i volti nelle immagini usando il rilevamento facciale basato su IA (MediaPipe).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Elaborazione:** asincrona (restituisce 202, interroga `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `face-detection` (200-300 MB)

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| file | file | Sì | - | File immagine (multipart) |
| blurRadius | number | No | `30` | Raggio di sfocatura applicato ai volti rilevati (1-100) |
| sensitivity | number | No | `0.5` | Sensibilità del rilevamento facciale (0-1). Valori più bassi rilevano meno volti con maggiore confidenza |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Risposta {#response}

### Risposta iniziale (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Avanzamento (SSE su `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Risultato finale (tramite SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Nessun volto rilevato {#no-faces-detected}

Se non viene trovato alcun volto, il risultato include un avviso:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Note {#notes}

- Richiede l'installazione del bundle del modello `face-detection` (200-300 MB).
- Il formato di output corrisponde automaticamente a quello di input.
- L'array `faces` contiene le coordinate del riquadro delimitante (x, y, width, height) per ogni volto rilevato.
- Aumenta `sensitivity` (più vicino a 1.0) per rilevare più volti, inclusi quelli parzialmente occlusi.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
