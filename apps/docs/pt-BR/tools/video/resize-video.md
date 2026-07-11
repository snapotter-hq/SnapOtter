---
description: "Escala um vídeo para uma nova resolução ou tamanho predefinido."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: a449db5e331c
---

# Resize Video {#resize-video}

Escala um vídeo para uma nova resolução usando dimensões de pixels personalizadas ou um preset padrão.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| width | integer | Não | - | Largura de destino em pixels (16-7680) |
| height | integer | Não | - | Altura de destino em pixels (16-4320) |
| preset | string | Não | `"custom"` | Preset de resolução: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Quando `preset` é `"custom"`, pelo menos um entre `width` ou `height` deve ser fornecido. A outra dimensão é escalada proporcionalmente.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Redimensionar para dimensões personalizadas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Os valores de preset mapeiam para alturas padrão (por exemplo, `720p` = 1280x720, `1080p` = 1920x1080). A largura é escalada proporcionalmente a partir da proporção da origem.
- As dimensões são arredondadas para números pares, conforme exigido pela maioria dos codecs de vídeo.
- A resolução máxima suportada é 7680x4320 (8K UHD).
