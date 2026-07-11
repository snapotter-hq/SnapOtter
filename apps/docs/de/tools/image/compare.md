---
description: "Vergleicht zwei Bilder nebeneinander mit pixelgenauer Diff-Visualisierung und Ähnlichkeitswert."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: d546843e33e8
---

# Bildvergleich {#image-compare}

Laden Sie zwei Bilder hoch, um eine pixelgenaue Differenzkarte und einen numerischen Ähnlichkeitsprozentsatz zu berechnen. Die Ausgabe ist ein Diff-Bild, das veränderte Bereiche in Rot hervorhebt.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/compare`

Akzeptiert Multipart-Formulardaten mit **zwei** Bilddateien. Ein Einstellungsfeld ist nicht erforderlich.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Laden Sie genau zwei Bilddateien hoch.

| Feld | Typ | Erforderlich | Beschreibung |
|-------|------|----------|-------------|
| file (erste) | file | Ja | Das erste Bild |
| file (zweite) | file | Ja | Das zweite Bild |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Antwortfelder {#response-fields}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| jobId | string | Auftrags-ID zum Herunterladen des Diff-Bildes |
| similarity | number | Prozentuale Ähnlichkeit zwischen den beiden Bildern (0 bis 100) |
| dimensions | object | Für den Vergleich verwendete Breite und Höhe |
| downloadUrl | string | URL zum Herunterladen des erzeugten Diff-Bildes |
| originalSize | number | Kombinierte Größe beider Eingabebilder in Byte |
| processedSize | number | Größe des Diff-Ausgabebildes in Byte |

## Hinweise {#notes}

- Beide Bilder werden vor dem Vergleich auf dieselben Abmessungen skaliert (das Maximum jeder Achse).
- Das Diff-Bild hebt Unterschiede in Rot hervor, mit einer Deckkraft proportional zum Ausmaß der Veränderung. Identische oder nahezu identische Pixel (Differenz < 10) werden als halbtransparente Versionen des Originals dargestellt.
- Die Ähnlichkeit wird als Kehrwert der durchschnittlichen Pixeldifferenz über alle Pixel berechnet und als Prozentsatz ausgedrückt.
- Eine Ähnlichkeit von 100 % bedeutet, dass die Bilder pixelidentisch sind (bei der Vergleichsauflösung).
- Die Diff-Ausgabe ist unabhängig von den Eingabeformaten immer im PNG-Format.
- Beide Bilder werden vor dem Vergleich validiert und dekodiert (HEIC, RAW, PSD, SVG werden unterstützt).
- Die EXIF-Ausrichtung wird vor der Verarbeitung automatisch auf beide Bilder angewendet.
