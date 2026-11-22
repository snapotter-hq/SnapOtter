---
description: "Converte um clipe de vídeo em uma imagem AVIF animada."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: ddcea4c37d93
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Converte um clipe de vídeo em uma imagem AVIF animada com taxa de quadros, largura, qualidade e trecho do clipe configuráveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | Não | `12` | Taxa de quadros de saída (1-30) |
| width | integer | Não | `480` | Largura de saída em pixels (64-1280). A altura é escalada proporcionalmente |
| startS | number | Não | `0` | Onde o clipe começa, em segundos |
| durationS | number | Não | `5` | Duração do clipe em segundos (até 60) |
| quality | integer | Não | `50` | Qualidade AVIF (1-100) |
| loop | boolean | Não | `true` | Repete a animação em loop |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

A codificação AV1 é mais lenta que GIF ou WebP, então esta ferramenta costuma responder `202` com um job para acompanhar via SSE em `/api/v1/jobs/{jobId}/progress`. Um clipe curto pode terminar dentro da janela síncrona e devolver o resultado diretamente:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- AVIF animado é livre de royalties e costuma ficar menor que um WebP ou GIF animado com a mesma qualidade visual.
- Os navegadores atuais reproduzem AVIF animado. Alguns visualizadores de imagem de desktop mostram apenas o primeiro quadro.
- A faixa de áudio é descartada.
