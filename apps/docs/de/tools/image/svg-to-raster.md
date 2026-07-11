---
description: "SVG-Dateien in benutzerdefinierter Auflösung und DPI nach PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF oder JXL konvertieren, mit Batch-Unterstützung."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 905d944a709c
---

# SVG zu Raster {#svg-to-raster}

Konvertiert SVG-Dateien in benutzerdefinierter Auflösung und DPI in Rasterbildformate (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF oder JXL). Unterstützt außerdem die Batch-Konvertierung mehrerer SVGs.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| width | integer | Nein | - | Zielbreite in Pixeln (1 bis 65536). Behält das Seitenverhältnis bei, wenn nur eine Dimension gesetzt ist. |
| height | integer | Nein | - | Zielhöhe in Pixeln (1 bis 65536). Behält das Seitenverhältnis bei, wenn nur eine Dimension gesetzt ist. |
| dpi | integer | Nein | 300 | Render-DPI, steuert die Basis-Rasterisierungsdichte (36 bis 2400) |
| quality | number | Nein | 90 | Ausgabequalität für verlustbehaftete Formate (1 bis 100) |
| backgroundColor | string | Nein | `"#00000000"` | Hintergrundfarbe als Hexwert (6 oder 8 Zeichen, 8 Zeichen enthalten Alpha) |
| outputFormat | string | Nein | `"png"` | Ausgabeformat: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch-Endpunkt {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Konvertiert mehrere SVG-Dateien in einer Anfrage. Gibt ein ZIP-Archiv zurück.

### Zusätzliche Batch-Parameter {#additional-batch-parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Nein | - | Optionale, vom Client bereitgestellte Job-ID zur Fortschrittsverfolgung (max. 128 Zeichen) |

### Batch-Beispielanfrage {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch-Antwort {#batch-response}

Der Batch-Endpunkt streamt eine ZIP-Datei direkt mit den Headern:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Hinweise {#notes}

- Akzeptiert nur SVG- und SVGZ-Dateien (validiert den Inhalt, nicht nur die Erweiterung). SVGZ wird automatisch dekomprimiert.
- SVG-Inhalte werden vor dem Rendern bereinigt, um XSS und das Laden externer Ressourcen zu verhindern.
- Die Einstellung `dpi` steuert die Dichte, mit der das SVG rasterisiert wird. Ein höherer DPI-Wert erzeugt aus demselben SVG-Viewport größere Pixelabmessungen.
- Wenn sowohl `width` als auch `height` angegeben sind, wird das Bild mit `fit: inside` skaliert (behält das Seitenverhältnis innerhalb der Grenzen bei).
- Für Formate, die Browser nicht nativ anzeigen können (TIFF, HEIF), ist eine `previewUrl` in der Antwort enthalten. Die Vorschau ist ein 1200px großes WebP-Thumbnail.
- Der Standardhintergrund `#00000000` ist vollständig transparent. Setzen Sie ihn auf `#FFFFFF` für einen weißen Hintergrund (nützlich bei JPEG-Ausgabe, die keine Transparenz unterstützt).
- Die Batch-Verarbeitung berücksichtigt die Serverkonfiguration `MAX_BATCH_SIZE` und nutzt für die Leistung parallele Worker.
- Der Fortschritt bei Batch-Operationen kann über SSE unter `/api/v1/jobs/:jobId/progress` verfolgt werden.
