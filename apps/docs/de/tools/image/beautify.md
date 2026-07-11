---
description: "Schlichte Screenshots mit Farbverlaufshintergründen, Geräterahmen, Schatten und Social-Media-Formaten in ansprechende Bilder verwandeln."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 380ece5d9674
---

# Screenshot aufwerten {#beautify-screenshot}

Fügt Screenshots Farbverlaufshintergründe, Geräterahmen, Schatten, Wasserzeichen und Social-Media-Formate hinzu. Ideal, um ansprechende Bilder für Produktmarketing, Social Media und Dokumentation zu erstellen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Nein | `"linear-gradient"` | Hintergrundtyp: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | Nein | `"#667eea"` | Volltonfarbe des Hintergrunds (verwendet, wenn `backgroundType` `solid` ist) |
| gradientStops | array | Nein | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Farbstopps des Verlaufs (min. 2). Jeder Stopp hat `color` (hex) und `position` (0-100). |
| gradientAngle | number | Nein | 135 | Winkel des Farbverlaufs in Grad (0 bis 360) |
| padding | number | Nein | 64 | Abstand um das Bild herum in Pixeln (0 bis 256) |
| borderRadius | number | Nein | 12 | Eckenradius des Screenshots (0 bis 64) |
| shadowPreset | string | Nein | `"subtle"` | Schatten-Voreinstellung: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | Nein | 20 | Benutzerdefinierter Schattenweichzeichnungsradius (0 bis 100, verwendet, wenn `shadowPreset` `custom` ist) |
| shadowOffsetX | number | Nein | 0 | Benutzerdefinierter horizontaler Schattenversatz (-50 bis 50) |
| shadowOffsetY | number | Nein | 10 | Benutzerdefinierter vertikaler Schattenversatz (-50 bis 50) |
| shadowColor | string | Nein | `"#000000"` | Benutzerdefinierte Schattenfarbe als hex |
| shadowOpacity | number | Nein | 30 | Benutzerdefinierte Schattendeckkraft (0 bis 100) |
| frame | string | Nein | `"none"` | Geräte- oder Fensterrahmen: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | Nein | - | In den Titelleisten von Fensterrahmen angezeigter Titeltext |
| socialPreset | string | Nein | `"none"` | Auf Social-Media-Abmessungen anpassen: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | Nein | - | Optionale Wasserzeichen-Textüberlagerung |
| watermarkPosition | string | Nein | `"bottom-right"` | Wasserzeichenposition: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | Nein | 50 | Wasserzeichendeckkraft (0 bis 100) |
| outputFormat | string | Nein | `"png"` | Ausgabeformat: `png`, `jpeg`, `webp` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Mit Hintergrundbild {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Hinweise {#notes}

- Nimmt zwei Dateifelder entgegen: `file` (erforderlich, der Haupt-Screenshot) und `backgroundImage` (optional, verwendet, wenn `backgroundType` `image` ist).
- Unterstützt die Eingabeformate HEIC, RAW, PSD und SVG (automatisch dekodiert).
- Die Schatten-Voreinstellungen bilden bestimmte Werte ab:
  - `subtle`: Weichzeichnung 20, offsetY 4, Deckkraft 20 %
  - `medium`: Weichzeichnung 40, offsetY 10, Deckkraft 35 %
  - `dramatic`: Weichzeichnung 80, offsetY 20, Deckkraft 50 %
- Social-Media-Voreinstellungen passen die endgültige Ausgabe im Modus `contain` an die Zielabmessungen an:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Geräterahmen (`iphone`, `macbook`, `ipad`) fügen eine Hardware-Einfassung um das Bild hinzu und überspringen die Einstellung `borderRadius`.
- Wenn Transparenz erforderlich ist (Schatten, Eckenradius, Geräterahmen oder transparenter Hintergrund), wird die Ausgabe auf PNG erzwungen, selbst wenn `jpeg` ausgewählt ist.
- Bildhintergründe werden im Pipeline-/Batch-Modus nicht unterstützt.
