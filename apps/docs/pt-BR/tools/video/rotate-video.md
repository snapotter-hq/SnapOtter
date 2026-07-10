---
description: "Gira ou espelha um vídeo."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: e830bad28e9e
---

# Rotate Video {#rotate-video}

Gira um vídeo em 90, 180 ou 270 graus, ou o espelha horizontalmente ou verticalmente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| transform | string | Sim | - | Transformação a aplicar: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Gira 90 graus no sentido horário
- **ccw90** - Gira 90 graus no sentido anti-horário
- **180** - Gira 180 graus
- **hflip** - Espelha horizontalmente (espelho)
- **vflip** - Espelha verticalmente

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Rotações de 90 ou 270 graus trocam a largura e a altura do vídeo.
- As operações de espelhamento (hflip, vflip) não alteram as dimensões do vídeo.
