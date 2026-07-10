---
description: "Gerador de fotos de passaporte e documento de identidade com IA, com detecção de rosto, remoção de fundo e montagem de folha para impressão."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: b527f1df4d09
---

# Foto de Passaporte {#passport-photo}

Gerador de fotos de passaporte e documento de identidade com IA. Fluxo de trabalho em duas fases: analisar (detecção de rosto + remoção de fundo) e depois gerar (recortar, redimensionar e montar para impressão).

## Endpoints da API {#api-endpoints}

Esta ferramenta usa um fluxo de duas fases com endpoints separados para análise e geração.

**Pacotes de modelo:** `background-removal` e `face-detection`

---

### Fase 1: Analisar {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Detecta os pontos de referência do rosto e remove o fundo. Retorna os dados dos pontos de referência e uma pré-visualização para o frontend exibir uma prévia do recorte.

#### Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| clientJobId | string | Não | - | ID de job opcional para acompanhamento de progresso via SSE |

#### Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Resposta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progresso (SSE, opcional) {#progress-sse-optional}

Se `clientJobId` for fornecido, o progresso é transmitido (0-30% para detecção de rosto, 30-95% para remoção de fundo).

#### Erro: Nenhum Rosto Detectado (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Fase 2: Gerar {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Recorta, redimensiona e, opcionalmente, monta a foto em uma folha para impressão. Usa imagens em cache da Fase 1 (sem reexecução da IA).

#### Parâmetros (corpo JSON) {#parameters-json-body}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| jobId | string | Sim | - | ID do job da Fase 1 |
| filename | string | Sim | - | Nome do arquivo original da Fase 1 |
| countryCode | string | Sim | - | Código do país para a especificação do passaporte (por exemplo, `US`, `GB`, `IN`) |
| documentType | string | Não | `"passport"` | Tipo de documento (da especificação do país) |
| bgColor | string | Não | `"#FFFFFF"` | Cor de fundo em hexadecimal |
| printLayout | string | Não | `"none"` | Layout do papel de impressão: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Não | `0` | Restrição de tamanho máximo do arquivo em KB (0 = sem limite) |
| dpi | number | Não | `300` | DPI de saída (72-1200) |
| customWidthMm | number | Não | - | Largura personalizada da foto em mm (substitui a especificação do país) |
| customHeightMm | number | Não | - | Altura personalizada da foto em mm (substitui a especificação do país) |
| zoom | number | Não | `1` | Fator de zoom (0.5-3). Valores > 1 recortam mais próximo |
| adjustX | number | Não | `0` | Ajuste de posição horizontal |
| adjustY | number | Não | `0` | Ajuste de posição vertical |
| landmarks | object | Sim | - | Objeto de pontos de referência da resposta da Fase 1 |
| imageWidth | number | Sim | - | Largura da imagem da resposta da Fase 1 |
| imageHeight | number | Sim | - | Altura da imagem da resposta da Fase 1 |

#### Exemplo de Requisição {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Resposta (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Rota Base {#base-route}

`POST /api/v1/tools/image/passport-photo`

Retorna orientação para usar o sub-endpoint correto.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notas {#notes}

- Requer que os pacotes de modelo `background-removal` e `face-detection` estejam instalados.
- A Fase 1 executa a IA (pontos de referência do rosto + remoção de fundo) e armazena os resultados em cache. A Fase 2 é pura manipulação de imagem com Sharp (rápida, sem necessidade de IA).
- Os pontos de referência são retornados como coordenadas normalizadas (intervalo de 0-1 em relação às dimensões da imagem).
- O campo `preview` na resposta da análise é um PNG codificado em base64 (máximo de 800px de largura) para exibição rápida.
- As especificações de país incluem dimensões do documento, proporções de altura da cabeça e posicionamento da linha dos olhos com base nos requisitos oficiais de foto de passaporte.
- A opção `printLayout` gera uma folha com fotos lado a lado em papel 4x6\" ou A4, com espaçamentos de 2mm entre as fotos.
- Quando `maxFileSizeKb` está definido, a saída é comprimida iterativamente para caber dentro do limite de tamanho.
