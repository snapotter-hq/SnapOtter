---
description: "Convierte archivos de subtítulos entre SRT, WebVTT y ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: af734fb0058f
i18n_hash_version: 2
---

# Convertir subtítulos {#convert-subtitles}

Convierte un archivo de subtítulos entre SRT, WebVTT y ASS. La sincronización y el texto se conservan; el posicionamiento y los efectos de ASS no.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Acepta datos de formulario multipart con un archivo de subtítulos (`.srt`, `.vtt` o `.ass`) y un campo JSON `settings` opcional.

## Parámetros {#parameters}

| Parámetro | Tipo | Predeterminado | Descripción |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Formato de salida: `srt`, `vtt` o `ass` |
| `encoding` | string | `"auto"` | Codificación de texto de la entrada: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` o `euc-kr` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notas {#notes}

- Al convertir desde ASS se conservan la sincronización, el texto de los diálogos y el formato básico que admite el formato de destino: SRT mantiene cursiva, negrita, color y tamaño de fuente como etiquetas, y WebVTT mantiene cursiva, negrita y subrayado. El posicionamiento en pantalla, las animaciones y otros efectos de ASS se descartan.
- La salida siempre es UTF-8. Con `encoding` establecido en `auto`, un archivo UTF-8 válido se lee tal cual y cualquier otro se lee como Windows-1252, la codificación habitual de los archivos SRT antiguos de Europa occidental. Si los caracteres con acento o no latinos salen distorsionados, establece `encoding` con la codificación real del archivo (por ejemplo `gb18030` para chino simplificado o `windows-1251` para cirílico).
- Las subidas de subtítulos están limitadas a 1 MB de forma predeterminada. Sube o quita el límite con `MAX_SUBTITLE_SIZE_MB`.
