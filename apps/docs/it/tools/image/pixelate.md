---
description: "Applica un effetto di pixelatura all'intera immagine o a una regione specifica."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 0758bb867dc1
---

# Pixelate {#pixelate}

Applica un effetto di pixelatura a un'intera immagine o a una specifica regione rettangolare. Utile per oscurare contenuti sensibili come volti, targhe o informazioni personali.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Accetta dati form multipart con un file immagine e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | Dimensione del blocco di pixel (2-128); valori più grandi producono una pixelatura più grossolana |
| region | object | No | - | Limita la pixelatura a un rettangolo (vedi sotto) |

### Region Object {#region-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| left | integer | Yes | Offset a sinistra in pixel (>= 0) |
| top | integer | Yes | Offset in alto in pixel (>= 0) |
| width | integer | Yes | Larghezza della regione in pixel (>= 1) |
| height | integer | Yes | Altezza della regione in pixel (>= 1) |

## Example Request {#example-request}

Pixela l'intera immagine:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixela una regione specifica:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- Quando `region` è omesso, l'intera immagine viene pixelata.
- Le coordinate della regione sono in pixel relative all'angolo in alto a sinistra dell'immagine. La regione deve rientrare nei limiti dell'immagine.
- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
