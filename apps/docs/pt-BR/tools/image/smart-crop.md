---
description: "Recorte com reconhecimento de sujeito, rosto e entropia, que enquadra imagens de forma inteligente usando o Sharp e detecção de rostos por IA."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: a6285a156b49
---

# Recorte Inteligente (Smart Crop) {#smart-crop}

Recorte inteligente com reconhecimento de sujeito, de rosto ou baseado em aparagem (trim). Usa as estratégias de atenção/entropia do Sharp e detecção de rostos por IA para enquadramento inteligente.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para obter o status via SSE)

**Pacote de modelo:** `face-detection` (200-300 MB) - necessário apenas para o modo `face`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| mode | string | Não | `"subject"` | Modo de recorte: `subject`, `face`, `trim`. (Os valores legados `attention` e `content` mapeiam para `subject` e `trim`) |
| strategy | string | Não | `"attention"` | Estratégia para o modo de sujeito: `attention` ou `entropy` |
| width | integer | Não | - | Largura alvo em pixels |
| height | integer | Não | - | Altura alvo em pixels |
| padding | integer | Não | `0` | Percentual de preenchimento ao redor do sujeito (0-50) |
| facePreset | string | Não | `"head-shoulders"` | Predefinição de enquadramento de rosto: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Não | `0.5` | Sensibilidade da detecção de rostos (0-1) |
| threshold | integer | Não | `30` | Limiar do modo de aparagem para detecção de fundo (0-255) |
| padToSquare | boolean | Não | `false` | Preenche o resultado aparado até formar um quadrado |
| padColor | string | Não | `"#ffffff"` | Cor de fundo para o preenchimento |
| targetSize | integer | Não | - | Tamanho alvo para a saída preenchida (pixels) |
| quality | integer | Não | - | Qualidade de saída (1-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modos {#modes}

### Modo de Sujeito {#subject-mode}
Usa a estratégia de atenção ou entropia do Sharp para encontrar a região visualmente mais interessante e recorta ao redor dela.

### Modo de Rosto {#face-mode}
Detecta rostos usando IA e, em seguida, enquadra o recorte ao redor dos rostos detectados usando o(a) `facePreset` especificado(a). Recai para o modo de sujeito (estratégia de atenção) se nenhum rosto for detectado.

### Modo de Aparagem {#trim-mode}
Remove bordas/fundo uniformes da imagem. Opcionalmente, preenche o resultado até formar um quadrado com uma cor de fundo e um tamanho alvo especificados.

## Notas {#notes}

- Esta ferramenta usa a fábrica `createToolRoute` com `executionHint: "long"`, portanto retorna 202 com progresso via SSE.
- O modo de rosto requer o pacote de modelo `face-detection` (200-300 MB).
- Os modos de sujeito e de aparagem funcionam sem nenhum pacote de modelo de IA.
- O(A) `facePreset` determina o quão justo o recorte enquadra os rostos detectados: `closeup` é o mais justo, `half-body` é o mais amplo.
- Se nenhuma largura/altura for especificada, o padrão é 1080x1080.
