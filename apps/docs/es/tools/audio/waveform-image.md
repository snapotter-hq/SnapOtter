---
description: "Genera una visualización de la forma de onda como imagen PNG a partir de un archivo de audio."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 7e306027290b
---

# Imagen de forma de onda {#waveform-image}

Genera una visualización de la forma de onda como imagen PNG a partir de un archivo de audio, con dimensiones y color configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Ancho de la imagen en píxeles (256 a 3840) |
| height | integer | No | `256` | Alto de la imagen en píxeles (64 a 1080) |
| color | string | No | `"#4f46e5"` | Color hexadecimal de la forma de onda (p. ej. `"#4f46e5"`) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notas {#notes}

- La salida siempre es una imagen PNG, independientemente del formato de audio de entrada.
- La forma de onda se renderiza sobre un fondo transparente.
- Útil para miniaturas, vistas previas en redes sociales o para incrustar en páginas web.
