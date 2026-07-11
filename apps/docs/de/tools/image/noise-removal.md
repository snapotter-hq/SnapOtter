---
description: "KI-gestützte Entfernung von Rauschen und Körnung mit mehrstufigen Qualitätsoptionen."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 2f7d1725b54f
---

# Rauschentfernung {#noise-removal}

KI-gestützte Entfernung von Rauschen und Körnung mit mehrstufigen Qualitätsoptionen, unter Verwendung des Python-Sidecars (SCUNet-Modell).

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundle:** `upscale-enhance` (5-6 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| tier | string | Nein | `"balanced"` | Qualitätsstufe: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Nein | `50` | Stärke der Rauschunterdrückung (0-100) |
| detailPreservation | number | Nein | `50` | Wie viele Details erhalten bleiben (0-100). Höhere Werte behalten mehr Textur bei |
| colorNoise | number | Nein | `30` | Stärke der Farbrauschunterdrückung (0-100) |
| format | string | Nein | `"original"` | Ausgabeformat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nein | `90` | Kodierungsqualität der Ausgabe (1-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
```

## Antwort {#response}

### Erste Antwort (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Fortschritt (SSE unter `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Hinweise {#notes}

- Erfordert das installierte Modell-Bundle `upscale-enhance` (5-6 GB).
- Qualitätsstufen tauschen Geschwindigkeit gegen Qualität: `quick` ist am schnellsten mit einfacher Rauschunterdrückung, `maximum` verwendet den gründlichsten Mehrfachdurchlauf-Ansatz.
- Der Parameter `detailPreservation` ist bei texturierten Motiven (Stoff, Haare, Laub) entscheidend. Höhere Werte verhindern, dass der Entrauscher feine Details weichzeichnet.
- Wenn `format` auf `"original"` gesetzt ist, entspricht das Ausgabeformat dem Format der Eingabedatei.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
