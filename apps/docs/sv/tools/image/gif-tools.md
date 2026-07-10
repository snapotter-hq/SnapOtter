---
description: "Storleksändra, optimera, ändra hastighet, vänd, rotera och extrahera bildrutor från animerade GIF-filer i ett enda verktyg."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: ba0115a2d6d4
---

# GIF-verktyg {#gif-tools}

Storleksändra, optimera, ändra hastighet, vänd, extrahera bildrutor och rotera animerade GIF-filer. Erbjuder flera driftlägen i ett enda verktyg.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parametrar {#parameters}

### Gemensamma parametrar {#common-parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Nej | `"resize"` | Driftläge: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Nej | 0 | Antal loopar för utdata-GIF (0 = oändligt, 1-100 = ändligt antal loopar) |

### Parametrar för storleksändringsläge {#resize-mode-parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| width | integer | Nej | - | Målbredd i pixlar (1 till 16384) |
| height | integer | Nej | - | Målhöjd i pixlar (1 till 16384) |
| percentage | number | Nej | - | Skala med procent (1 till 500). Åsidosätter width/height om den anges. |

### Parametrar för optimeringsläge {#optimize-mode-parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| colors | number | Nej | 256 | Maximalt antal färger i paletten (2 till 256) |
| dither | number | Nej | 1.0 | Ditheringstyrka (0 till 1, där 0 inaktiverar dithering) |
| effort | number | Nej | 7 | Optimeringsnivå (1 till 10, högre = långsammare men mindre) |

### Parametrar för hastighetsläge {#speed-mode-parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Nej | 1.0 | Hastighetsmultiplikator (0.1 till 10). Värden > 1 snabbar upp, < 1 saktar ner. |

### Parametrar för extraheringsläge {#extract-mode-parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| extractMode | string | Nej | `"single"` | Extraheringsläge: `single`, `range`, `all` |
| frameNumber | number | Nej | 0 | Bildruteindex att extrahera i läget `single` (0-baserat) |
| frameStart | number | Nej | 0 | Startbildruteindex för läget `range` (0-baserat) |
| frameEnd | number | Nej | - | Slutbildruteindex för läget `range` (0-baserat, inklusive) |
| extractFormat | string | Nej | `"png"` | Format för extraherade bildrutor: `png`, `webp` |

### Parametrar för rotationsläge {#rotate-mode-parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| angle | number | Nej | - | Rotationsvinkel: `90`, `180` eller `270` grader |
| flipH | boolean | Nej | `false` | Vänd horisontellt |
| flipV | boolean | Nej | `false` | Vänd vertikalt |

## Exempelbegäranden {#example-requests}

### Storleksändra {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimera {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Snabba upp {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extrahera enstaka bildruta {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info-underrutt {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Returnerar metadata om en animerad GIF utan att bearbeta den.

### Info-begäran {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info-svar {#info-response}

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

## Anmärkningar {#notes}

- Använder standardfabriken `createToolRoute` för den huvudsakliga bearbetningsslutpunkten.
- Info-slutpunkten kräver endast en filuppladdning (inga inställningar behövs).
- I läget `resize`, om `percentage` anges har den prioritet över `width`/`height`. Storleksändringen använder `fit: inside` för att bibehålla bildförhållandet.
- I läget `speed` divideras bildrutefördröjningarna med hastighetsfaktorn. Minsta fördröjning per bildruta är 20ms (begränsning i GIF-specifikationen).
- I läget `reverse` är parametern `speedFactor` också tillgänglig för att samtidigt justera hastigheten medan vändningen sker.
- I läget `extract` med `range` eller `all` är utdata en ZIP-fil som innehåller enskilda bildrutor.
- I läget `rotate` bearbetas varje bildruta individuellt och sätts åter samman till en animation.
- Parametern `loop` styr hur många gånger utdata-GIF:en loopar. Använd 0 för oändlig loopning.
- Fältet `duration` i info-svaret är den totala animationslängden i millisekunder.
