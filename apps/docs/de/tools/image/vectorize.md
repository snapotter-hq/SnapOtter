---
description: "Rasterbilder mit Schwarz-Weiß-Vektorisierung (potrace) und vollfarbiger mehrschichtiger Vektorisierung in SVG umwandeln."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: b18b6c32c25e
---

# Bild zu SVG {#image-to-svg}

Vektorisiert Rasterbilder mithilfe von Trace-Algorithmen in SVG. Unterstützt Schwarz-Weiß-Tracing (potrace) und vollfarbige mehrschichtige Vektorisierung.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| colorMode | string | Nein | `"bw"` | Trace-Modus: `bw` (schwarz-weiß) oder `color` (mehrfarbige Ebenen) |
| threshold | number | Nein | 128 | Helligkeitsschwellenwert für den S/W-Modus (0 bis 255). Pixel darunter werden schwarz. |
| colorPrecision | number | Nein | 6 | Farbquantisierungspräzision für den Farbmodus (1 bis 16). Höhere Werte erzeugen mehr eigenständige Farbebenen. |
| layerDifference | number | Nein | 6 | Minimaler Farbunterschied zwischen Ebenen im Farbmodus (1 bis 128) |
| filterSpeckle | number | Nein | 4 | Mindestfläche für getracte Formen in Pixeln (1 bis 256). Entfernt Rauschen/Flecken. |
| pathMode | string | Nein | `"spline"` | Pfadglättung: `none` (zackig), `polygon` (gerade Segmente), `spline` (glatte Kurven) |
| cornerThreshold | number | Nein | 60 | Winkelschwellenwert für die Eckenerkennung im Farbmodus (0 bis 180 Grad) |
| invert | boolean | Nein | `false` | Das Bild vor dem Tracing invertieren (schwarz/weiß tauschen) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Farbvektorisierung {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Hinweise {#notes}

- Die Ausgabe ist unabhängig vom Eingabeformat immer eine SVG-Datei.
- Unterstützt HEIC-, RAW-, PSD- und SVG-Eingabeformate (vor dem Tracing automatisch in Raster dekodiert).
- Der S/W-Modus verwendet den potrace-Algorithmus. Das Bild wird zuerst in Graustufen umgewandelt und dann vor dem Tracing auf reines Schwarz/Weiß mit einem Schwellenwert versehen.
- Der Farbmodus verwendet einen mehrschichtigen Ansatz: Das Bild wird in Farbebenen quantisiert, die jeweils separat getract und in der SVG-Ausgabe gestapelt werden.
- Niedrigere `filterSpeckle`-Werte bewahren mehr Details, erzeugen aber größere SVG-Dateien mit mehr Pfaden.
- Die Einstellung `pathMode` beeinflusst die Dateigröße erheblich: `none` erzeugt die meisten Pfade, `spline` erzeugt die glatteste (und meist kleinste) Ausgabe.
- Für beste Ergebnisse bei Logos und Icons verwenden Sie den S/W-Modus mit einer sauberen, kontrastreichen Eingabe. Für Fotos oder Illustrationen verwenden Sie den Farbmodus mit höherer `colorPrecision`.
