---
description: "Converte le immagini raster in SVG con vettorizzazione in bianco e nero (potrace) e a colori multi-livello."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: e3dbdbed33ea
---

# Immagine in SVG {#image-to-svg}

Vettorizza le immagini raster in SVG usando algoritmi di tracciamento. Supporta il tracciamento in bianco e nero (potrace) e la vettorizzazione a colori multi-livello.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | Modalità di tracciamento: `bw` (bianco e nero) o `color` (livelli multi-colore) |
| threshold | number | No | 128 | Soglia di luminosità per la modalità B&N (da 0 a 255). I pixel al di sotto diventano neri. |
| colorPrecision | number | No | 6 | Precisione della quantizzazione del colore per la modalità a colori (da 1 a 16). Valori più alti producono livelli di colore più distinti. |
| layerDifference | number | No | 6 | Differenza minima di colore tra i livelli in modalità a colori (da 1 a 128) |
| filterSpeckle | number | No | 4 | Area minima per le forme tracciate in pixel (da 1 a 256). Rimuove rumore/macchioline. |
| pathMode | string | No | `"spline"` | Levigatura del tracciato: `none` (frastagliato), `polygon` (segmenti dritti), `spline` (curve morbide) |
| cornerThreshold | number | No | 60 | Soglia di angolo per il rilevamento degli angoli in modalità a colori (da 0 a 180 gradi) |
| invert | boolean | No | `false` | Inverte l'immagine prima del tracciamento (scambia bianco/nero) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Vettorizzazione a colori {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Note {#notes}

- L'output è sempre un file SVG indipendentemente dal formato di input.
- Supporta i formati di input HEIC, RAW, PSD e SVG (decodificati automaticamente in raster prima del tracciamento).
- La modalità B&N usa l'algoritmo potrace. L'immagine viene prima convertita in scala di grigi, poi soglizzata in bianco/nero puro prima del tracciamento.
- La modalità a colori usa un approccio multi-livello: l'immagine viene quantizzata in livelli di colore, ciascuno tracciato separatamente e impilato nell'output SVG.
- Valori più bassi di `filterSpeckle` preservano più dettagli ma producono file SVG più grandi con più tracciati.
- L'impostazione `pathMode` influisce notevolmente sulla dimensione del file: `none` produce il maggior numero di tracciati, `spline` produce l'output più morbido (e di solito più piccolo).
- Per risultati ottimali con loghi e icone, usa la modalità B&N con un input pulito ad alto contrasto. Per fotografie o illustrazioni, usa la modalità a colori con `colorPrecision` più alta.
