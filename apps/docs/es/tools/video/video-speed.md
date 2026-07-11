---
description: "Acelera o ralentiza un vídeo."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 9455e0f99776
---

# Video Speed {#video-speed}

Acelera o ralentiza un vídeo con la opción de conservar el tono del audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Multiplicador de velocidad (0.25-4). Los valores por encima de 1 aceleran, por debajo de 1 ralentizan |
| keepPitch | boolean | No | `true` | Conservar el tono del audio al cambiar la velocidad |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Un factor de `2` duplica la velocidad de reproducción (reduce la duración a la mitad). Un factor de `0.5` reduce la velocidad de reproducción a la mitad (duplica la duración).
- Cuando `keepPitch` es `true`, el audio se estira en el tiempo para que las voces suenen naturales. Cuando es `false`, el tono cambia proporcionalmente con la velocidad.
- El rango válido es de 0.25x a 4x.
