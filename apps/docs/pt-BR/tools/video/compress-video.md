---
description: "Reduz o tamanho do arquivo de vídeo com controle de qualidade."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 3e2c801a8f20
---

# Compress Video {#compress-video}

Reduz o tamanho do arquivo de vídeo usando uma força de compressão configurável e redução opcional de resolução.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`. Este é um endpoint assíncrono - ele retorna `202 Accepted` imediatamente e o progresso é transmitido via SSE em `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| quality | string | Não | `"balanced"` | Força de compressão: `light`, `balanced`, `strong` |
| resolution | string | Não | `"original"` | Resolução de saída: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- O preset `light` preserva a qualidade quase original. O preset `strong` reduz o tamanho do arquivo de forma agressiva à custa da fidelidade visual.
- Reduzir a resolução (por exemplo, de 4K para 720p) se soma à compressão para uma redução significativa de tamanho.
- As atualizações de progresso ficam disponíveis via SSE em `GET /api/v1/jobs/{jobId}/progress` até que o job seja concluído.
