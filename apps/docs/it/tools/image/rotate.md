---
description: "Ruota le immagini di qualsiasi angolo e capovolgile orizzontalmente o verticalmente."
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: caf0161dab05
---

# Ruota e capovolgi immagine {#rotate-flip}

Ruota le immagini di un angolo arbitrario e/o capovolgile orizzontalmente o verticalmente. Le operazioni di rotazione e capovolgimento possono essere combinate in un'unica richiesta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Accetta dati form multipart con un file immagine e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | Angolo di rotazione in gradi (in senso orario). Accetta qualsiasi valore numerico. |
| horizontal | boolean | No | `false` | Capovolgi l'immagine orizzontalmente (specchio) |
| vertical | boolean | No | `false` | Capovolgi l'immagine verticalmente |

## Example Request {#example-request}

Ruota di 90 gradi in senso orario:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Capovolgi orizzontalmente:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Ruota e capovolgi insieme:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- La rotazione viene applicata per prima, poi le operazioni di capovolgimento.
- Le rotazioni non a 90 gradi (ad es. 45 gradi) ingrandiscono la tela per adattarsi all'immagine ruotata, con riempimento trasparente o nero a seconda del formato di output.
- Valori comuni: 90, 180, 270 per rotazioni di un quarto di giro.
- L'orientamento EXIF viene applicato automaticamente prima dell'elaborazione, quindi la rotazione è relativa all'orientamento visivo.
