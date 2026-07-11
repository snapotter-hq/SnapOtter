---
description: "Optimiere Bilder für die Web-Auslieferung mit Formatkonvertierung, Qualitätssteuerung, Größenänderung und Metadaten-Entfernung."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 03f7d1fd4362
---

# Für Web optimieren {#optimize-for-web}

Optimiere Bilder für die Web-Auslieferung in einem einzigen Schritt. Kombiniert Formatkonvertierung, Qualitätsanpassung, optionale Größenänderung, progressive Kodierung und Metadaten-Entfernung.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

Ein Live-Vorschau-Endpunkt ist außerdem unter `POST /api/v1/tools/image/optimize-for-web/preview` verfügbar, der das verarbeitete Bild direkt als Binärdaten zurückgibt (ohne Workspace-Erstellung) für die Echtzeit-Anpassung von Parametern.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Nein | `"webp"` | Ausgabeformat: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | Nein | `80` | Ausgabequalität (1-100) |
| maxWidth | number | Nein | - | Maximale Breite in Pixeln. Das Bild wird herunterskaliert, wenn es breiter ist. |
| maxHeight | number | Nein | - | Maximale Höhe in Pixeln. Das Bild wird herunterskaliert, wenn es höher ist. |
| progressive | boolean | Nein | `true` | Progressive/interlaced Kodierung aktivieren |
| stripMetadata | boolean | Nein | `true` | EXIF-, GPS-, ICC- und XMP-Metadaten entfernen |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Für AVIF mit aggressiver Kompression optimieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Antwort des Vorschau-Endpunkts {#preview-endpoint-response}

Der Vorschau-Endpunkt (`/api/v1/tools/image/optimize-for-web/preview`) gibt das Bild direkt als Binärdaten mit informativen Headern zurück:

- `X-Original-Size` - Ursprüngliche Dateigröße in Bytes
- `X-Processed-Size` - Verarbeitete Dateigröße in Bytes
- `X-Output-Filename` - URL-kodierter Ausgabedateiname

## Hinweise {#notes}

- Dieses Werkzeug ist als vollständige Optimierungs-Pipeline für Web-Assets konzipiert. Es übernimmt Formatkonvertierung, Qualitätsanpassung, Begrenzung der maximalen Abmessungen und Metadaten-Entfernung in einem einzigen Durchlauf.
- Die Endung des Ausgabedateinamens wird an das gewählte Format angepasst.
- Die JXL-Kodierung (JPEG XL) verwendet einen spezialisierten CLI-Encoder. Das Bild wird zunächst als PNG verarbeitet und dann in JXL kodiert.
- Progressive Kodierung verbessert die wahrgenommene Ladezeit von JPEG und PNG, da Browser eine Vorschau in niedriger Qualität rendern können, bevor das vollständige Bild geladen ist.
- Der Vorschau-Endpunkt ist ressourcenschonender (keine Workspace-/Job-Erstellung) und für die Live-Parameteranpassung im Frontend gedacht.
