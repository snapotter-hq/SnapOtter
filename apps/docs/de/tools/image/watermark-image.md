---
description: "Ein Logo oder Bild als Wasserzeichen mit konfigurierbarer Position, Deckkraft und Skalierung überlagern."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 83d4a51e2169
---

# Bild-Wasserzeichen {#image-watermark}

Überlagert ein Logo oder ein sekundäres Bild als Wasserzeichen auf einem Basisbild. Das Wasserzeichen wird relativ zur Breite des Basisbildes skaliert und an einer Ecke oder in der Mitte positioniert.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Nimmt Multipart-Formulardaten mit **zwei** Bilddateien und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| position | string | Nein | `"bottom-right"` | Platzierung des Wasserzeichens: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | Nein | `50` | Deckkraft des Wasserzeichens in Prozent (0 bis 100) |
| scale | number | Nein | `25` | Breite des Wasserzeichens als Prozentsatz der Hauptbildbreite (1 bis 100) |

### Dateifelder {#file-fields}

| Feldname | Erforderlich | Beschreibung |
|------------|----------|-------------|
| file | Ja | Das Haupt-/Basisbild |
| watermark | Ja | Das Wasserzeichen-/Logobild |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Hinweise {#notes}

- Beide Bilder werden validiert und dekodiert (HEIC, RAW, PSD, SVG werden unterstützt).
- Das Wasserzeichen wird proportional so skaliert, dass seine Breite `scale` % der Hauptbildbreite entspricht.
- Die Deckkraft wird über eine mit `dest-in`-Überblendung komponierte Alphamaske angewendet.
- Eckpositionen verwenden einen Abstand von 20px zum Bildrand.
- Wenn das Wasserzeichenbild Transparenz aufweist (z. B. ein PNG-Logo), wird diese beim Zusammensetzen erhalten.
- Die EXIF-Ausrichtung wird bei beiden Bildern vor der Verarbeitung automatisch angewendet.
