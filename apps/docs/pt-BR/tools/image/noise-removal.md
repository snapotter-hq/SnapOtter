---
description: "Remoção de ruído e granulação com IA e opções de qualidade em múltiplos níveis."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: d925e7a9ac1f
---

# Remoção de Ruído {#noise-removal}

Remoção de ruído e granulação com IA e opções de qualidade em múltiplos níveis, usando o sidecar Python (modelo SCUNet).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para status via SSE)

**Pacote de modelo:** `upscale-enhance` (5-6 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| tier | string | Não | `"balanced"` | Nível de qualidade: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Não | `50` | Intensidade de remoção de ruído (0-100) |
| detailPreservation | number | Não | `50` | Quanto detalhe preservar (0-100). Valores mais altos mantêm mais textura |
| colorNoise | number | Não | `30` | Intensidade da redução de ruído de cor (0-100) |
| format | string | Não | `"original"` | Formato de saída: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Não | `90` | Qualidade de codificação da saída (1-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
```

## Resposta {#response}

### Resposta Inicial (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progresso (SSE em `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notas {#notes}

- Requer que o pacote de modelo `upscale-enhance` esteja instalado (5-6 GB).
- Os níveis de qualidade trocam velocidade por qualidade: `quick` é o mais rápido com remoção básica de ruído, `maximum` usa a abordagem mais completa de múltiplas passagens.
- O parâmetro `detailPreservation` é fundamental para assuntos com textura (tecido, cabelo, folhagem). Valores mais altos impedem que o removedor de ruído suavize detalhes finos.
- Quando `format` está definido como `"original"`, o formato de saída corresponde ao formato do arquivo de entrada.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
