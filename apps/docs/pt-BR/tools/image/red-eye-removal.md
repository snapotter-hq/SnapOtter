---
description: "Detecção e correção com IA do olho vermelho causado pelo flash da câmera."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: dd935a63b0d2
---

# Remoção de Olho Vermelho {#red-eye-removal}

Detecção e correção com IA do olho vermelho causado pelo flash da câmera.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para status via SSE)

**Pacote de modelo:** `face-detection` (200-300 MB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| sensitivity | number | Não | `50` | Sensibilidade da detecção de olho vermelho (0-100). Valores mais altos detectam olhos vermelhos mais sutis |
| strength | number | Não | `70` | Intensidade da correção (0-100). Quão agressivamente neutralizar o vermelho |
| format | string | Não | - | Formato de saída (substituição opcional) |
| quality | number | Não | `90` | Qualidade de saída (1-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notas {#notes}

- Requer que o pacote de modelo `face-detection` esteja instalado (200-300 MB).
- Primeiro detecta os rostos, depois localiza as regiões dos olhos dentro de cada rosto e, por fim, identifica e corrige os pixels de olho vermelho.
- A contagem `facesDetected` indica quantos rostos foram encontrados; `eyesCorrected` é o número total de olhos individuais que tiveram o olho vermelho corrigido.
- A saída é sempre PNG para máxima preservação de qualidade.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
