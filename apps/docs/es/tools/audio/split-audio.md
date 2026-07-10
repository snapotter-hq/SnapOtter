---
description: "Divide el audio por intervalos de tiempo, partes iguales o detección de silencios."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 513bc508c04a
---

# Dividir audio {#split-audio}

Divide un archivo de audio en segmentos por intervalos de tiempo fijos, partes iguales o detección automática de silencios. Devuelve un archivo ZIP con los segmentos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Estrategia de división: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Longitud del segmento en segundos, 1 a 3600 (se usa cuando mode es `time`) |
| parts | integer | No | `2` | Número de partes iguales, 2 a 20 (se usa cuando mode es `parts`) |
| thresholdDb | number | No | `-40` | Umbral de silencio en dB, -80 a -20 (se usa cuando mode es `silence`) |
| minSilenceS | number | No | `0.3` | Intervalo mínimo de silencio en segundos, 0.1 a 10 (se usa cuando mode es `silence`) |

## Ejemplo de solicitud {#example-request}

Dividir en segmentos de 30 segundos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Dividir por detección de silencios:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notas {#notes}

- El `downloadUrl` apunta a un archivo ZIP que contiene todos los segmentos.
- Solo se usan los parámetros relevantes para el `mode` elegido; los demás se ignoran.
- Los nombres de archivo de los segmentos están numerados secuencialmente (p. ej. `part-000.mp3`, `part-001.mp3`).
- El formato de salida coincide con el formato de entrada.
