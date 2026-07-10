---
description: "Combina varios archivos de audio en una sola pista secuencial."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: b69faa944b80
---

# Combinar audio {#merge-audio}

Combina dos o más archivos de audio en una sola pista secuencial, concatenados en el orden en que se suben.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Acepta datos de formulario multipart con varios archivos de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato de salida: `mp3`, `wav`, `flac`, `m4a` |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Notas {#notes}

- Acepta de 2 a 10 archivos de audio por solicitud.
- Los archivos se concatenan en el orden de subida.
- Todos los archivos de entrada se recodifican al formato de salida y la frecuencia de muestreo elegidos para una unión sin fisuras.
- Se admiten formatos de entrada mixtos (por ejemplo, un WAV y un MP3).
