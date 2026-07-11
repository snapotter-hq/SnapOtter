---
description: "Redimensionamento por corte de costura (seam carving) que adiciona ou remove pixels ao longo de caminhos de baixa importância para preservar o conteúdo principal e os rostos."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: d6732db341fa
---

# Redimensionamento com Reconhecimento de Conteúdo {#content-aware-resize}

Redimensionamento por corte de costura (seam carving) que remove ou adiciona pixels de forma inteligente ao longo dos caminhos de menor importância visual, preservando o conteúdo importante e, opcionalmente, protegendo os rostos.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Processamento:** Síncrono (retorna o resultado diretamente)

**Pacote do modelo:** Nenhum necessário para a operação básica. A proteção de rostos usa o pacote `face-detection` (200-300 MB) se ativada.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| width | number | Não | - | Largura alvo em pixels |
| height | number | Não | - | Altura alvo em pixels |
| protectFaces | boolean | Não | `false` | Detecta e protege rostos da remoção de costuras |
| blurRadius | number | Não | `4` | Raio de desfoque de pré-processamento para o cálculo de energia (0-20) |
| sobelThreshold | number | Não | `2` | Limiar de detecção de bordas Sobel (1-20). Valores maiores tornam o algoritmo mais agressivo |
| square | boolean | Não | `false` | Redimensiona para um quadrado (usa a menor dimensão) |

Pelo menos um entre `width`, `height` ou `square` deve ser especificado.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Resposta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notas {#notes}

- Esta rota personalizada atualmente retorna uma resposta síncrona 200.
- Usa a biblioteca de corte de costura `caire` para o redimensionamento com reconhecimento de conteúdo.
- Apenas reduz as dimensões (remove costuras). Não pode expandir uma imagem além do seu tamanho original.
- A opção `protectFaces` usa detecção de rostos por IA para marcar as regiões de rosto como de alta energia, impedindo que as costuras passem pelos rostos.
- `blurRadius` controla a suavização antes do cálculo do mapa de energia. Valores maiores tornam o mapa de energia mais uniforme, o que pode ajudar com imagens ruidosas.
- `sobelThreshold` afeta o quão agressivamente as bordas são detectadas. Valores menores preservam mais bordas sutis.
- A saída é sempre no formato PNG.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
