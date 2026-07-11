---
description: "Ein Bild auf einen zentrierten Kreis mit transparenten Ecken zuschneiden."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 55ade771d4d8
---

# Kreiszuschnitt {#circle-crop}

Schneidet ein Bild auf einen zentrierten Kreis mit transparenten Ecken zu. Unterstützt anpassbaren Zoom, Versatz, Rahmen und Ausgabegröße.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| zoom | number | Nein | `1` | Zoomfaktor (1-5); höhere Werte schneiden enger zu |
| offsetX | number | Nein | `0.5` | Horizontale Mittelposition (0-1) |
| offsetY | number | Nein | `0.5` | Vertikale Mittelposition (0-1) |
| borderWidth | integer | Nein | `0` | Rahmenbreite in Pixeln (0-200) |
| borderColor | string | Nein | `"#ffffff"` | Hex-Farbe des Rahmens |
| background | string | Nein | `"transparent"` | Eckenfüllung: `"transparent"` oder eine Hex-Farbe |
| outputSize | integer | Nein | - | Endgültige quadratische Abmessung in Pixeln (16-4096) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Hinweise {#notes}

- Die Ausgabe ist immer PNG, um die transparenten Ecken zu erhalten (sofern `background` nicht auf eine Volltonfarbe gesetzt ist).
- Der Kreis wird in die kürzere Abmessung des Bildes eingeschrieben. Verwenden Sie `zoom`, um enger zuzuschneiden, und `offsetX`/`offsetY`, um den sichtbaren Bereich zu verschieben.
- Wenn `outputSize` angegeben ist, wird das Ergebnis nach dem Zuschneiden auf diese quadratische Abmessung skaliert.
- Eingaben in HEIC, RAW, PSD und SVG werden vor der Verarbeitung automatisch dekodiert.
