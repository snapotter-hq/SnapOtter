---
description: "Corrige PNGs com transparência falsa usando matting por IA (BiRefNet) para produzir alfa verdadeiro, além de limpeza de bordas com defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 0177d4566d1e
---

# Corretor de Transparência de PNG {#png-transparency-fixer}

Corrige PNGs com transparência falsa em um clique. Usa matting por IA (modelo BiRefNet HR Matting) para produzir transparência alfa verdadeira, com pós-processamento de defringe para limpar as bordas.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para obter o status via SSE)

**Pacote de modelo:** `background-removal` (4-5 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| defringe | number | Não | `30` | Intensidade de defringe (0-100). Remove pixels de franja semitransparentes ao redor das bordas |
| outputFormat | string | Não | `"png"` | Formato de saída: `png` ou `webp` |
| removeWatermark | boolean | Não | `false` | Aplica pré-processamento de remoção de marca d'água (filtro de mediana) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notas {#notes}

- Requer que o pacote de modelo `background-removal` esteja instalado (4-5 GB).
- Usa `birefnet-hr-matting` como modelo principal para matting alfa de alta qualidade. Recai para `birefnet-general` se o modelo HR ficar sem memória.
- A opção `defringe` remove pixels de franja semitransparentes que o matting por IA às vezes deixa ao redor de cabelos, pelos e bordas finas. Ela funciona desfocando o canal alfa e zerando pixels de baixa confiança.
- A opção `removeWatermark` aplica uma etapa de pré-processamento com filtro de mediana. É uma redução básica de marca d'água, não uma ferramenta dedicada de remoção de marca d'água.
- Produz apenas PNG ou WebP sem perdas (ambos suportam transparência alfa).
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
