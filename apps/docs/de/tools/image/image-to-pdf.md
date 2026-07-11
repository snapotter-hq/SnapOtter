---
description: "Kombiniert ein oder mehrere Bilder zu einem PDF-Dokument mit Optionen für Seitengröße, Ausrichtung und Zieldateigröße."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 5850e7c97016
---

# Bild zu PDF {#image-to-pdf}

Kombiniert ein oder mehrere Bilder zu einem PDF-Dokument. Unterstützt mehrere Seitengrößen, Ausrichtungen, Ränder und optionale Zieldateigröße über die Qualitätsanpassung.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Akzeptiert Multipart-Formulardaten mit einer oder mehreren Bilddateien und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| pageSize | string | Nein | `"A4"` | Seitengröße: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Nein | `"portrait"` | Seitenausrichtung: `portrait` oder `landscape` |
| margin | number | Nein | `20` | Seitenrand in Punkten (0-500) |
| targetSize | object | Nein | - | Beschränkung der Zieldateigröße (siehe unten) |
| collate | boolean | Nein | `true` | Alle Bilder in einem PDF kombinieren. Falls `false`, wird pro Bild ein PDF erstellt. |

### Objekt „Zielgröße“ {#target-size-object}

| Feld | Typ | Erforderlich | Beschreibung |
|-------|------|----------|-------------|
| value | number | Ja | Wert der Zielgröße |
| unit | string | Ja | Einheit: `KB` oder `MB` |

Die minimale Zielgröße beträgt 50 KB.

## Beispielanfrage {#example-request}

Einfaches PDF aus mehreren Bildern:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Mit Zieldateigröße:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Ein PDF pro Bild:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Beispielantwort (zusammengeführt) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Beispielantwort (nicht zusammengeführt) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Beispielantwort (mit Zielgröße) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Hinweise {#notes}

- Bilder werden auf der Seite zentriert und so skaliert, dass sie unter Beibehaltung des Seitenverhältnisses innerhalb der Ränder passen. Bilder werden niemals hochskaliert.
- Wenn `collate` auf `false` steht, wird jedes Bild zu einer separaten PDF-Datei, und der Download ist ein ZIP-Archiv, das alle PDFs enthält.
- Die Funktion für die Zielgröße verwendet eine iterative binäre Suche über die JPEG-Qualitätsstufen (10-95), um die beste Qualität zu finden, die in das Budget passt.
- Transparente Bilder werden vor dem Einbetten in das PDF auf Weiß abgeflacht.
- Unterstützte Eingabeformate: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG und mehr.
- Die EXIF-Ausrichtung wird vor dem Einbetten automatisch angewendet.
