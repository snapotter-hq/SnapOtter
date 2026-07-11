---
description: "Convierte voz en texto con transcripción impulsada por IA."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 60aea729c253
---

# Transcribir audio {#transcribe-audio}

Convierte voz en texto mediante transcripción impulsada por IA (faster-whisper). Admite formatos de salida de texto plano, SRT y VTT con selección de idioma automática o manual.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Formato de salida: `txt`, `srt`, `vtt` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Ejemplo de respuesta {#example-response}

Esta es una herramienta asíncrona. La API devuelve `202 Accepted` de inmediato:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Sigue el progreso mediante SSE en `GET /api/v1/jobs/{jobId}/progress`. Cuando el trabajo termina, el flujo SSE entrega el resultado final con un `downloadUrl`.

## Notas {#notes}

- Requiere que esté instalado el paquete de funciones **transcription**. Devuelve `501` con el código `FEATURE_NOT_INSTALLED`, el `feature` que falta, `featureName` y `estimatedSize` si el paquete no está disponible.
- Usa faster-whisper para la transcripción. El idioma `auto` detecta automáticamente el idioma hablado.
- Los formatos `srt` y `vtt` incluyen marcas de tiempo para cada segmento, adecuados para subtítulos.
- El formato `txt` devuelve texto plano sin marcas de tiempo.
- Esta es una herramienta de IA de ejecución prolongada; el tiempo de procesamiento depende de la duración del audio y del hardware del servidor.
