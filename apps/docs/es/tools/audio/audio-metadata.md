---
description: "Consulta, edita o elimina las etiquetas de metadatos de audio (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 0045ce4e1a17
---

# Metadatos de audio {#audio-metadata}

Consulta, edita o elimina las etiquetas de metadatos de audio como el título, el artista y el álbum (ID3 y formatos de etiqueta similares).

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | Elimina todas las etiquetas de metadatos existentes |
| title | string | No | - | Establece la etiqueta de título (máx. 500 caracteres) |
| artist | string | No | - | Establece la etiqueta de artista (máx. 500 caracteres) |
| album | string | No | - | Establece la etiqueta de álbum (máx. 500 caracteres) |

## Solicitud de ejemplo {#example-request}

Editar etiquetas de metadatos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Eliminar todos los metadatos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Notas {#notes}

- La respuesta incluye un objeto `metadata` con el formato del contenedor, la duración, la tasa de bits y las etiquetas actuales.
- Cuando `strip` es `true`, todos los campos de etiqueta se ignoran y se elimina cada etiqueta existente.
- Solo se actualizan las etiquetas que proporcionas; las etiquetas no especificadas permanecen sin cambios.
- El formato de salida coincide con el formato de entrada.
