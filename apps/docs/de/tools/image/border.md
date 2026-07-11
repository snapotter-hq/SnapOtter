---
description: "Bildern in einer vorhersehbaren, steuerbaren Reihenfolge Rahmen, Abstände, abgerundete Ecken und Schlagschatten hinzufügen."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: d78cfae90fa8
---

# Rahmen & Einfassung {#border-frame}

Fügt Bildern Rahmen, Abstände, abgerundete Ecken und Schlagschatten hinzu. Das Werkzeug wendet die Effekte in dieser Reihenfolge an: Abstand, Rahmen, Eckenradius, dann Schatten.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| borderWidth | number | Nein | 10 | Rahmenstärke in Pixeln (0 bis 2000) |
| borderColor | string | Nein | `"#000000"` | Rahmenfarbe als hex (z. B. `#FF0000`) |
| padding | number | Nein | 0 | Innenabstand zwischen Bild und Rahmen in Pixeln (0 bis 200) |
| paddingColor | string | Nein | `"#FFFFFF"` | Füllfarbe des Abstands als hex |
| cornerRadius | number | Nein | 0 | Eckenradius in Pixeln (0 bis 2000) |
| shadow | boolean | Nein | `false` | Ob ein Schlagschatten hinzugefügt wird |
| shadowBlur | number | Nein | 15 | Schattenweichzeichnungsradius (1 bis 200) |
| shadowOffsetX | number | Nein | 0 | Horizontaler Schattenversatz (-50 bis 50) |
| shadowOffsetY | number | Nein | 5 | Vertikaler Schattenversatz (-50 bis 50) |
| shadowColor | string | Nein | `"#000000"` | Schattenfarbe als hex |
| shadowOpacity | number | Nein | 40 | Schattendeckkraft in Prozent (0 bis 100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Hinweise {#notes}

- Verwendet die Standard-Factory `createToolRoute`. Nimmt eine einzelne Bilddatei über einen Multipart-Upload entgegen.
- Unterstützt die Eingabeformate HEIC, RAW, PSD und SVG (automatisch dekodiert).
- Verarbeitungsreihenfolge: Zuerst wird der Abstand hinzugefügt, dann legt sich der Rahmen darum, dann wird der Eckenradius angewendet, dann wird der Schatten eingesetzt.
- Wenn `cornerRadius` oder `shadow` aktiviert ist, wird die Ausgabe (unabhängig vom Eingabeformat) auf PNG erzwungen, um die Transparenz zu erhalten. Formate, die Alpha unterstützen (PNG, WebP, AVIF), behalten ihr ursprüngliches Format.
- Der Schatten ist formbewusst: Er folgt den abgerundeten Ecken, statt einen rechteckigen Schatten zu erzeugen.
- Setzt man `borderWidth` auf 0 und verwendet nur `cornerRadius` + `shadow`, entsteht ein rahmenloser abgerundeter Schatteneffekt.
