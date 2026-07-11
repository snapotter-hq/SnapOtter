---
description: "Fälschlich transparente PNGs mit KI-Freistellung (BiRefNet) korrigieren, um echtes Alpha zu erzeugen, plus Randbereinigung durch Defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: dffe02a1271f
---

# PNG-Transparenz-Korrektur {#png-transparency-fixer}

Korrigiert fälschlich transparente PNGs mit einem Klick. Nutzt KI-Freistellung (BiRefNet HR Matting-Modell), um echte Alpha-Transparenz zu erzeugen, mit Defringe-Nachbearbeitung zur Kantenbereinigung.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Verarbeitung:** Asynchron (liefert 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abrufen)

**Modell-Bundle:** `background-removal` (4-5 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (Multipart) |
| defringe | number | Nein | `30` | Defringe-Intensität (0-100). Entfernt halbtransparente Randpixel um die Kanten |
| outputFormat | string | Nein | `"png"` | Ausgabeformat: `png` oder `webp` |
| removeWatermark | boolean | Nein | `false` | Wasserzeichenentfernung als Vorverarbeitung anwenden (Medianfilter) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Hinweise {#notes}

- Erfordert die Installation des Modell-Bundles `background-removal` (4-5 GB).
- Verwendet `birefnet-hr-matting` als primäres Modell für hochwertige Alpha-Freistellung. Fällt auf `birefnet-general` zurück, wenn dem HR-Modell der Speicher ausgeht.
- Die Option `defringe` entfernt halbtransparente Randpixel, die die KI-Freistellung mitunter um Haare, Fell und feine Kanten hinterlässt. Sie arbeitet, indem sie den Alphakanal weichzeichnet und Pixel mit geringer Konfidenz auf null setzt.
- Die Option `removeWatermark` wendet einen Medianfilter als Vorverarbeitungsschritt an. Es handelt sich um eine grundlegende Wasserzeichenreduzierung, nicht um ein dediziertes Werkzeug zur Wasserzeichenentfernung.
- Gibt nur PNG oder verlustfreies WebP aus (beide unterstützen Alpha-Transparenz).
- Unterstützt HEIC/HEIF-, RAW-, TGA-, PSD-, EXR- und HDR-Eingabeformate durch automatische Dekodierung.
