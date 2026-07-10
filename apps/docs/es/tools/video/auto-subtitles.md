---
description: "Genera archivos de subtítulos a partir de las pistas de audio de un vídeo mediante IA."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: b9f08b6dd120
---

# Subtítulos automáticos {#auto-subtitles}

Genera archivos de subtítulos a partir de la pista de audio de un vídeo mediante reconocimiento de voz con inteligencia artificial (faster-whisper). Admite la detección automática y 10 idiomas explícitos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`. Este es un endpoint asíncrono: devuelve `202 Accepted` de inmediato y el progreso se transmite mediante SSE en `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Idioma del habla: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | Formato de subtítulos de salida: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Esta es una herramienta de IA que requiere que el paquete de funciones de **transcripción** esté instalado. Si el paquete no está instalado, la API devuelve `501 Feature Not Installed` con instrucciones para instalarlo mediante la interfaz de administración.
- La opción de idioma `auto` usa la detección de idioma integrada de whisper. Especificar el idioma de forma explícita mejora la precisión y la velocidad.
- SRT es el formato de subtítulos más ampliamente compatible. VTT (WebVTT) es el estándar para los reproductores de vídeo web.
- Las actualizaciones de progreso están disponibles mediante SSE en `GET /api/v1/jobs/{jobId}/progress` hasta que el trabajo se complete.
