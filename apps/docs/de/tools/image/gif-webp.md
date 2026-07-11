---
description: "Konvertiert animierte GIFs in WebP und umgekehrt und behält dabei alle Frames bei."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 82112c90f500
---

# GIF/WebP-Konverter {#gif-webp-converter}

Konvertiert animierte GIF-Dateien in WebP und umgekehrt und behält dabei alle Frames und das Animations-Timing bei. WebP-Animationen sind typischerweise 25-35 % kleiner als vergleichbare GIFs.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Akzeptiert Multipart-Formulardaten mit einer GIF- oder WebP-Datei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| quality | integer | Nein | `80` | Ausgabequalität für die WebP-Codierung (1-100) |
| lossless | boolean | Nein | `false` | Verlustfreie WebP-Kompression verwenden |
| resizePercent | integer | Nein | `100` | Ausgabe in Prozent skalieren (10-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Hinweise {#notes}

- Es werden nur `.gif`- und `.webp`-Dateien akzeptiert. Andere Bildformate werden von diesem Werkzeug nicht unterstützt.
- Die Konvertierungsrichtung erfolgt automatisch: GIF-Eingabe erzeugt WebP-Ausgabe, und WebP-Eingabe erzeugt GIF-Ausgabe.
- Die Optionen `quality` und `lossless` gelten nur beim Codieren in WebP. Bei der Konvertierung in GIF verwendet die Ausgabe die standardmäßige GIF-Palette.
- Verwenden Sie `resizePercent`, um die Abmessungen (und die Dateigröße) großer Animationen zu reduzieren.
