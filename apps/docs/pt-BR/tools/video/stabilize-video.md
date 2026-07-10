---
description: "Reduz a trepidação da câmera com estabilização em duas passagens."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: c153d1466ace
---

# Stabilize Video {#stabilize-video}

Reduz a trepidação da câmera em filmagens feitas à mão usando a estabilização vidstab em duas passagens do FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`. Este é um endpoint assíncrono - ele retorna `202 Accepted` imediatamente e o progresso é transmitido via SSE em `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| smoothing | integer | Não | `15` | Tamanho da janela de suavização em quadros (5-60). Valores mais altos produzem movimento mais suave |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- A estabilização é um processo em duas passagens: a primeira passagem analisa o movimento da câmera e a segunda aplica a correção. Isso leva cerca de duas vezes mais tempo do que as ferramentas de passagem única.
- Valores de suavização mais altos removem mais trepidação, mas podem introduzir um leve recorte de zoom nas bordas.
- As atualizações de progresso ficam disponíveis via SSE em `GET /api/v1/jobs/{jobId}/progress` até que o job seja concluído.
