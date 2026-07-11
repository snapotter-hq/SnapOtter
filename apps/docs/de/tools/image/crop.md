---
description: "Schneidet Bilder zu, indem ein Bereich über Position und Abmessungen angegeben wird."
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: 381bf2d3b47b
---

# Zuschneiden {#crop}

Schneidet Bilder zu, indem ein rechteckiger Bereich über Position und Größe definiert wird. Unterstützt sowohl Pixel- als auch Prozenteinheiten.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/crop`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| left | number | Ja | - | X-Versatz des Zuschneidebereichs (von der linken Kante) |
| top | number | Ja | - | Y-Versatz des Zuschneidebereichs (von der oberen Kante) |
| width | number | Ja | - | Breite des Zuschneidebereichs |
| height | number | Ja | - | Höhe des Zuschneidebereichs |
| unit | string | Nein | `"px"` | Einheit für die Werte: `px` oder `percent` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Mit Prozentwerten zuschneiden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Hinweise {#notes}

- Der Zuschneidebereich muss innerhalb der Bildgrenzen liegen. Ragt der Bereich über das Bild hinaus, schlägt die Anfrage fehl.
- Bei Verwendung der Einheit `percent` stellen die Werte Prozentsätze der Bildabmessungen dar (z. B. bedeutet `left: 10` 10 % von der linken Kante).
- Das Ausgabeformat entspricht dem Eingabeformat.
- Die EXIF-Ausrichtung wird vor dem Zuschneiden automatisch angewendet, sodass die Koordinaten der optisch korrekten Ausrichtung entsprechen.
