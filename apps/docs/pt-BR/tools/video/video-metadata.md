---
description: "Remove metadados de um vídeo e informa o que foi encontrado."
i18n_source_hash: 9c0af022032a
i18n_provenance: machine
i18n_output_hash: e876c7f52c6b
i18n_hash_version: 2
---

# Clean Video Metadata {#clean-video-metadata}

Remove metadados (data de criação, coordenadas GPS, modelo da câmera, tags de software, etc.) de um vídeo e informa o que foi removido.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Aceita dados de formulário multipart com um arquivo de vídeo. Esta ferramenta não tem configurações ajustáveis.

## Parameters {#parameters}

Esta ferramenta não tem parâmetros. Ela remove todos os metadados do contêiner do vídeo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ],
    "removed": ["title", "comment", "location", "creation_time"]
  }
}
```

## Notes {#notes}

- `metadata.removed` lista os nomes das tags do contêiner que foram removidas. Os valores não são retornados. Um array vazio significa que nada foi removido.
- Os metadados removidos incluem carimbos de data/hora de criação, dados de GPS/localização, informações da câmera/dispositivo e tags de software.
- Os streams de vídeo e áudio são copiados sem recodificação, então não há perda de qualidade.
- Útil para privacidade antes de compartilhar vídeos publicamente.
