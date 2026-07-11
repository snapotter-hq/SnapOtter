---
description: "Transforma um clipe de vídeo em um GIF animado."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: ff4f8c864094
---

# Video to GIF {#video-to-gif}

Transforma um clipe de vídeo em um GIF animado com taxa de quadros, largura, tempo de início e duração configuráveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`. Este é um endpoint assíncrono - ele retorna `202 Accepted` imediatamente e o progresso é transmitido via SSE em `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| fps | integer | Não | `12` | Taxa de quadros de saída (1-30) |
| width | integer | Não | `480` | Largura de saída em pixels (64-1280). A altura é escalada proporcionalmente |
| startS | number | Não | `0` | Tempo de início em segundos (deve ser >= 0) |
| durationS | number | Não | `5` | Duração em segundos (acima de 0, máx 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Valores mais baixos de `fps` e `width` produzem arquivos GIF menores. Um GIF de 480px de largura a 12 fps costuma ser um bom equilíbrio.
- A duração máxima é de 60 segundos. Clipes mais longos produzem arquivos muito grandes.
- As atualizações de progresso ficam disponíveis via SSE em `GET /api/v1/jobs/{jobId}/progress` até que o job seja concluído.
