---
description: "Größe ändern, optimieren, Geschwindigkeit anpassen, umkehren, drehen und Frames aus animierten GIFs extrahieren, alles in einem Werkzeug."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 2c1a8704cbd1
---

# GIF-Werkzeuge {#gif-tools}

Größe ändern, optimieren, Geschwindigkeit anpassen, umkehren, Frames extrahieren und animierte GIFs drehen. Bietet mehrere Betriebsmodi in einem einzigen Werkzeug.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parameter {#parameters}

### Allgemeine Parameter {#common-parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Nein | `"resize"` | Betriebsmodus: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Nein | 0 | Anzahl der Wiederholungen für die GIF-Ausgabe (0 = unendlich, 1-100 = endliche Wiederholungen) |

### Parameter für den Modus „Größe ändern“ {#resize-mode-parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| width | integer | Nein | - | Zielbreite in Pixeln (1 bis 16384) |
| height | integer | Nein | - | Zielhöhe in Pixeln (1 bis 16384) |
| percentage | number | Nein | - | Skalierung in Prozent (1 bis 500). Überschreibt width/height, wenn gesetzt. |

### Parameter für den Modus „Optimieren“ {#optimize-mode-parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| colors | number | Nein | 256 | Maximale Anzahl an Farben in der Palette (2 bis 256) |
| dither | number | Nein | 1.0 | Dithering-Stärke (0 bis 1, wobei 0 das Dithering deaktiviert) |
| effort | number | Nein | 7 | Optimierungsaufwand (1 bis 10, höher = langsamer, aber kleiner) |

### Parameter für den Modus „Geschwindigkeit“ {#speed-mode-parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Nein | 1.0 | Geschwindigkeitsmultiplikator (0.1 bis 10). Werte > 1 beschleunigen, < 1 verlangsamen. |

### Parameter für den Modus „Extrahieren“ {#extract-mode-parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| extractMode | string | Nein | `"single"` | Extraktionsmodus: `single`, `range`, `all` |
| frameNumber | number | Nein | 0 | Zu extrahierender Frame-Index im Modus `single` (0-basiert) |
| frameStart | number | Nein | 0 | Start-Frame-Index für den Modus `range` (0-basiert) |
| frameEnd | number | Nein | - | End-Frame-Index für den Modus `range` (0-basiert, einschließlich) |
| extractFormat | string | Nein | `"png"` | Format für extrahierte Frames: `png`, `webp` |

### Parameter für den Modus „Drehen“ {#rotate-mode-parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| angle | number | Nein | - | Drehwinkel: `90`, `180` oder `270` Grad |
| flipH | boolean | Nein | `false` | Horizontal spiegeln |
| flipV | boolean | Nein | `false` | Vertikal spiegeln |

## Beispielanfragen {#example-requests}

### Größe ändern {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimieren {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Beschleunigen {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Einzelnen Frame extrahieren {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info-Unterroute {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Gibt Metadaten zu einem animierten GIF zurück, ohne es zu verarbeiten.

### Info-Anfrage {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info-Antwort {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Hinweise {#notes}

- Verwendet die standardmäßige `createToolRoute`-Factory für den Haupt-Verarbeitungsendpunkt.
- Der Info-Endpunkt erfordert nur einen Datei-Upload (keine Einstellungen erforderlich).
- Im Modus `resize` hat `percentage`, falls angegeben, Vorrang vor `width`/`height`. Die Größenänderung verwendet `fit: inside`, um das Seitenverhältnis beizubehalten.
- Im Modus `speed` werden die Frame-Verzögerungen durch den Geschwindigkeitsfaktor geteilt. Die minimale Verzögerung pro Frame beträgt 20 ms (Einschränkung der GIF-Spezifikation).
- Im Modus `reverse` ist zusätzlich der Parameter `speedFactor` verfügbar, um die Geschwindigkeit gleichzeitig mit dem Umkehren anzupassen.
- Im Modus `extract` mit `range` oder `all` ist die Ausgabe eine ZIP-Datei mit einzelnen Frames.
- Im Modus `rotate` wird jeder Frame einzeln verarbeitet und wieder zu einer Animation zusammengesetzt.
- Der Parameter `loop` steuert, wie oft die GIF-Ausgabe wiederholt wird. Verwenden Sie 0 für eine unendliche Wiederholung.
- Das Feld `duration` in der Info-Antwort ist die Gesamtdauer der Animation in Millisekunden.
