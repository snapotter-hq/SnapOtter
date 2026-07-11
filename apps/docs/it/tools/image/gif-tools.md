---
description: "Ridimensiona, ottimizza, cambia velocità, inverti, ruota ed estrai fotogrammi da GIF animate in un unico strumento."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 5f9277240963
---

# Strumenti GIF {#gif-tools}

Ridimensiona, ottimizza, cambia velocità, inverti, estrai fotogrammi e ruota GIF animate. Offre più modalità operative in un unico strumento.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parametri {#parameters}

### Parametri Comuni {#common-parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"resize"` | Modalità operativa: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | No | 0 | Numero di ripetizioni per la GIF di output (0 = infinito, 1-100 = ripetizioni finite) |

### Parametri della Modalità Resize {#resize-mode-parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Larghezza target in pixel (da 1 a 16384) |
| height | integer | No | - | Altezza target in pixel (da 1 a 16384) |
| percentage | number | No | - | Scala per percentuale (da 1 a 500). Sovrascrive width/height se impostato. |

### Parametri della Modalità Optimize {#optimize-mode-parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| colors | number | No | 256 | Numero massimo di colori nella palette (da 2 a 256) |
| dither | number | No | 1.0 | Intensità del dithering (da 0 a 1, dove 0 disabilita il dithering) |
| effort | number | No | 7 | Livello di impegno dell'ottimizzazione (da 1 a 10, più alto = più lento ma più piccolo) |

### Parametri della Modalità Speed {#speed-mode-parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| speedFactor | number | No | 1.0 | Moltiplicatore di velocità (da 0.1 a 10). Valori > 1 accelerano, < 1 rallentano. |

### Parametri della Modalità Extract {#extract-mode-parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| extractMode | string | No | `"single"` | Modalità di estrazione: `single`, `range`, `all` |
| frameNumber | number | No | 0 | Indice del fotogramma da estrarre in modalità `single` (in base 0) |
| frameStart | number | No | 0 | Indice del fotogramma iniziale per la modalità `range` (in base 0) |
| frameEnd | number | No | - | Indice del fotogramma finale per la modalità `range` (in base 0, incluso) |
| extractFormat | string | No | `"png"` | Formato per i fotogrammi estratti: `png`, `webp` |

### Parametri della Modalità Rotate {#rotate-mode-parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| angle | number | No | - | Angolo di rotazione: `90`, `180` o `270` gradi |
| flipH | boolean | No | `false` | Capovolgi orizzontalmente |
| flipV | boolean | No | `false` | Capovolgi verticalmente |

## Richieste di Esempio {#example-requests}

### Resize {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimize {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Speed Up {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Estrai Singolo Fotogramma {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Risposta di Esempio {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Sotto-rotta Info {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Restituisce i metadati di una GIF animata senza elaborarla.

### Richiesta Info {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Risposta Info {#info-response}

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

## Note {#notes}

- Usa la factory `createToolRoute` standard per l'endpoint di elaborazione principale.
- L'endpoint info richiede solo il caricamento di un file (nessuna impostazione necessaria).
- In modalità `resize`, se viene fornito `percentage` ha la priorità su `width`/`height`. Il ridimensionamento usa `fit: inside` per mantenere le proporzioni.
- In modalità `speed`, i ritardi dei fotogrammi vengono divisi per il fattore di velocità. Il ritardo minimo per fotogramma è di 20ms (limitazione delle specifiche GIF).
- In modalità `reverse`, è disponibile anche il parametro `speedFactor` per regolare simultaneamente la velocità durante l'inversione.
- In modalità `extract` con `range` o `all`, l'output è un file ZIP contenente i singoli fotogrammi.
- In modalità `rotate`, ogni fotogramma viene elaborato individualmente e riassemblato in un'animazione.
- Il parametro `loop` controlla quante volte la GIF di output viene ripetuta. Usa 0 per il loop infinito.
- Il campo `duration` nella risposta info è la durata totale dell'animazione in millisecondi.
