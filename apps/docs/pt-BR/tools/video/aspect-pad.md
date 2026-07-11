---
description: "Adicione barras de cor sólida para se ajustar a uma proporção alvo."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 1997e726d6c8
---

# Aspect Pad {#aspect-pad}

Adicione barras letterbox ou pillarbox de cor sólida para ajustar um vídeo a uma proporção alvo sem recortar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| target | string | Não | `"9:16"` | Proporção alvo: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Não | `"#000000"` | Cor hexadecimal para as barras de preenchimento (por exemplo `"#000000"` para preto) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Se o vídeo já corresponder à proporção alvo, o arquivo é retornado sem alteração.
- Use `9:16` para formatos verticais/retrato de mídias sociais (TikTok, Reels, Shorts).
- Para preenchimento desfocado em vez de cor sólida, use a ferramenta Blur Pad.
