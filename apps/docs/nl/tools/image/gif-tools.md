---
description: "Vergroot/verklein, optimaliseer, wijzig de snelheid, keer om, roteer en extraheer frames uit geanimeerde GIF's in één enkel hulpmiddel."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: d26467ae5a9b
---

# GIF-tools {#gif-tools}

Vergroot/verklein, optimaliseer, wijzig de snelheid, keer om, extraheer frames en roteer geanimeerde GIF's. Biedt meerdere bewerkingsmodi in één enkel hulpmiddel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parameters {#parameters}

### Algemene parameters {#common-parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `"resize"` | Bewerkingsmodus: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Nee | 0 | Aantal herhalingen voor de uitvoer-GIF (0 = oneindig, 1-100 = eindig aantal herhalingen) |

### Parameters voor vergroten/verkleinen-modus {#resize-mode-parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| width | integer | Nee | - | Doelbreedte in pixels (1 tot 16384) |
| height | integer | Nee | - | Doelhoogte in pixels (1 tot 16384) |
| percentage | number | Nee | - | Schaal op percentage (1 tot 500). Overschrijft width/height indien ingesteld. |

### Parameters voor optimaliseren-modus {#optimize-mode-parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| colors | number | Nee | 256 | Maximaal aantal kleuren in het palet (2 tot 256) |
| dither | number | Nee | 1.0 | Ditheringsterkte (0 tot 1, waarbij 0 dithering uitschakelt) |
| effort | number | Nee | 7 | Optimalisatie-inspanningsniveau (1 tot 10, hoger = langzamer maar kleiner) |

### Parameters voor snelheidsmodus {#speed-mode-parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Nee | 1.0 | Snelheidsvermenigvuldiger (0.1 tot 10). Waarden > 1 versnellen, < 1 vertragen. |

### Parameters voor extractiemodus {#extract-mode-parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| extractMode | string | Nee | `"single"` | Extractiemodus: `single`, `range`, `all` |
| frameNumber | number | Nee | 0 | Frame-index om te extraheren in `single`-modus (0-gebaseerd) |
| frameStart | number | Nee | 0 | Startframe-index voor `range`-modus (0-gebaseerd) |
| frameEnd | number | Nee | - | Eindframe-index voor `range`-modus (0-gebaseerd, inclusief) |
| extractFormat | string | Nee | `"png"` | Formaat voor geëxtraheerde frames: `png`, `webp` |

### Parameters voor rotatiemodus {#rotate-mode-parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| angle | number | Nee | - | Rotatiehoek: `90`, `180` of `270` graden |
| flipH | boolean | Nee | `false` | Horizontaal spiegelen |
| flipV | boolean | Nee | `false` | Verticaal spiegelen |

## Voorbeeldverzoeken {#example-requests}

### Vergroten/verkleinen {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimaliseren {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Versnellen {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Eén frame extraheren {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info-subroute {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Retourneert metadata over een geanimeerde GIF zonder deze te verwerken.

### Info-verzoek {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info-antwoord {#info-response}

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

## Opmerkingen {#notes}

- Gebruikt de standaard `createToolRoute`-factory voor het hoofdverwerkingsendpoint.
- Het info-endpoint vereist alleen een bestandsupload (geen instellingen nodig).
- In `resize`-modus heeft `percentage` voorrang op `width`/`height` als het is opgegeven. Het vergroten/verkleinen gebruikt `fit: inside` om de beeldverhouding te behouden.
- In `speed`-modus worden framevertragingen gedeeld door de snelheidsfactor. De minimale vertraging per frame is 20ms (beperking van de GIF-specificatie).
- In `reverse`-modus is de parameter `speedFactor` ook beschikbaar om de snelheid gelijktijdig aan te passen tijdens het omkeren.
- In `extract`-modus met `range` of `all` is de uitvoer een ZIP-bestand met de individuele frames.
- In `rotate`-modus wordt elk frame afzonderlijk verwerkt en opnieuw samengevoegd tot een animatie.
- De parameter `loop` bepaalt hoe vaak de uitvoer-GIF wordt herhaald. Gebruik 0 voor oneindig herhalen.
- Het veld `duration` in het info-antwoord is de totale animatieduur in milliseconden.
