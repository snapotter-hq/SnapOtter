---
description: "Extrai um clipe de um vídeo especificando os tempos de início e fim."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: d3f2bc734849
---

# Trim Video {#trim-video}

Extrai um clipe de um vídeo especificando os tempos de início e fim em segundos, com uma opção para cortes precisos por quadro.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| startS | number | Não | `0` | Tempo de início em segundos (deve ser >= 0) |
| endS | number | Sim | - | Tempo de fim em segundos (deve ser posterior a startS) |
| precise | boolean | Não | `false` | Recodifica para cortes precisos por quadro em vez de busca por keyframe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Quando `precise` é `false` (o padrão), a ferramenta usa busca por keyframe, que é rápida mas pode começar alguns quadros antes do tempo solicitado.
- Definir `precise` como `true` recodifica o segmento para limites exatos de quadro, mas leva mais tempo.
- O valor de `endS` deve ser maior que `startS`.
