---
description: "Ändere die Größe von Bildern nach Pixeln, Prozent oder mit Anpassungsmodi."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: b6058533f4c2
---

# Bildgröße ändern {#resize}

Ändere die Größe von Bildern durch Angabe exakter Pixelabmessungen, eines prozentualen Skalierungsfaktors oder eines Anpassungsmodus, der steuert, wie sich das Bild an die Zielabmessungen anpasst.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/resize`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| width | integer | Nein | - | Zielbreite in Pixeln (maximal 16383) |
| height | integer | Nein | - | Zielhöhe in Pixeln (maximal 16383) |
| fit | string | Nein | `"contain"` | Wie das Bild an die Abmessungen angepasst wird: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | Nein | `false` | Hochskalieren verhindern, wenn das Bild kleiner als das Ziel ist |
| percentage | number | Nein | - | Nach Prozent skalieren (z. B. 50 für halbe Größe) |

Mindestens eines von `width`, `height` oder `percentage` muss angegeben werden.

### Anpassungsmodi {#fit-modes}

- **contain** - Größe so ändern, dass das Bild in die Abmessungen passt, unter Beibehaltung des Seitenverhältnisses (kann Leerraum lassen)
- **cover** - Größe so ändern, dass das Bild die Abmessungen ausfüllt, unter Beibehaltung des Seitenverhältnisses (kann zuschneiden)
- **fill** - Genau auf die Abmessungen strecken (ignoriert das Seitenverhältnis)
- **inside** - Wie `contain`, aber nur herunterskalieren, niemals hochskalieren
- **outside** - Wie `cover`, aber nur herunterskalieren, niemals hochskalieren

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Nach Prozent skalieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Hinweise {#notes}

- Die maximale Abmessung beträgt 16383 Pixel auf jeder Achse (Grenze von Sharp/libvips).
- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
- Die EXIF-Orientierung wird vor der Größenänderung automatisch angewendet.
- Das Flag `withoutEnlargement` ist nützlich für die Stapelverarbeitung, bei der einige Bilder bereits kleiner als das Ziel sein können.
