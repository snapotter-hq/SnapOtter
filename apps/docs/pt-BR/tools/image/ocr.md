---
description: "Extraia texto de imagens localmente com Tesseract integrado ou o tempo de execução opcional de alta precisão RapidOCR."
i18n_output_hash: 89cc41919a60
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Extração de Texto {#ocr-text-extraction}

Extraia texto de imagens sem enviar a imagem para um serviço externo. A camada `fast` integrada usa Tesseract. As camadas opcionais `balanced` e `best` usam RapidOCR com modelos PP-OCR ONNX fixados.


<!-- korean-ocr-contract:start -->
::: info Compatibilidade do OCR em coreano
O OCR rápido oferece suporte a `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, mas não a coreano (`ko`). Coreano exige o pacote de OCR preciso e `balanced` ou `best`. O pacote funciona nos contêineres oficiais Linux amd64 e arm64, inclusive em hosts NVIDIA, onde o OCR continua na CPU. Sistemas não compatíveis recebem um erro explícito e nunca retornam silenciosamente para `fast`. Coreano com `fast` ou com o alias legado `tesseract` é rejeitado antes da fila com `FEATURE_INCOMPATIBLE` e `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processamento:** O OCR é sempre assíncrono. Após a validação e o enfileiramento, o endpoint retorna imediatamente `202 Accepted` com um `jobId`. Acompanhe o fluxo de progresso SSE da tarefa até o evento terminal `complete` ou `failed`; o `result` de um evento bem-sucedido contém os campos de OCR.

**Pacote OCR preciso:** Tempo de execução `ocr` opcional (cerca de 208-234 MiB para download e 409-488 MiB instalados, dependendo do destino). `fast` não requer este pacote; o instalador verifica os tamanhos exatos vinculados ao índice assinado.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart), até 512 MiB codificados e 40 megapixels decodificados; um limite inferior de upload do operador ainda se aplica |
| quality | string | Não | Dinâmico | Nível de qualidade: `fast` (Tesseract), `balanced` (RapidOCR com os modelos PP-OCRv6 pequenos) ou `best` (os modelos PP-OCRv6 médios de maior precisão com pontuação de variante calibrada) |
| language | string | Não | `"auto"` | Sugestão de idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Não | Dependente do nível | Melhore o contraste local antes do reconhecimento. Fast aplica-o diretamente; Balanceado e Melhor retêm a variante somente quando a pontuação calibrada melhora o resultado. O padrão é `true` para `best` e `false` para `fast`/`balanced` |
| engine | string | Não | - | Alias ​​de compatibilidade obsoleta. Use `quality`. `tesseract` mapeia para `fast`; o valor legado `paddleocr` é mapeado para `balanced`, mas não carrega PaddlePaddle |

Quando `quality` e `engine` são omitidos, o SnapOtter escolhe o melhor nível disponível nesta ordem: `best`, `balanced`, `fast`. Para coreano, `fast` nunca é escolhido; usa-se `best`, depois `balanced`, ou é retornado o erro de instalação ou compatibilidade do runtime preciso.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Resposta aceita (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progresso e resultado (SSE) {#progress-sse-optional}

Conecte-se a `GET /api/v1/jobs/{jobId}/progress` com o `jobId` retornado pela resposta `202` (ou o `clientJobId` fornecido). Mantenha o fluxo aberto até o evento terminal `complete` ou `failed`. Um frame terminal bem-sucedido contém a saída do OCR em `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

As falhas de processamento chegam no campo `error` do evento terminal `failed`; elas não são retornadas como HTTP `422` após o enfileiramento.

## Notas {#notes}

- `fast` está sempre disponível em imagens SnapOtter suportadas. `balanced` e `best` requerem o pacote OCR preciso opcional.
- Tesseract integrado adiciona cerca de 25 MiB à imagem oficial. O pacote exato é armazenado em `/data/ai`, e não incorporado à imagem.
- O pacote exato é publicado para os contêineres oficiais Linux amd64 e arm64. Ele usa deliberadamente o provedor CPU de ONNX Runtime, inclusive em hosts NVIDIA, portanto, não depende de bibliotecas CUDA ou de compatibilidade com GPU. As instalações originais e pré-construídas do bare-metal usam o Fast OCR, a menos que forneçam seu próprio tempo de execução compatível.
- O `result` terminal bem-sucedido inclui o texto extraído em `text` e um artefato `.txt` para download em `downloadUrl`.
- SnapOtter respeita um nível solicitado explicitamente. Se `balanced` ou `best` não estiver disponível, API retornará `501` com `FEATURE_NOT_INSTALLED` ou `FEATURE_INCOMPATIBLE`; ele nunca faz downgrade silenciosamente da solicitação para outro nível.
- Um resultado vazio bem-sucedido permanece um resultado vazio. As falhas de tempo de execução retornam um erro em vez de tentar novamente com um mecanismo de qualidade inferior.
- O `result` terminal bem-sucedido relata `requestedQuality` e `actualQuality`, além do mecanismo, dispositivo, provedor, tempo de execução e versões do modelo, e quaisquer avisos.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
- Entradas codificadas superdimensionadas retornam `413`. Imagens com mais de 40 megapixels e respostas OCR acima de seus limites de saída limitados são rejeitadas em vez de serem parcialmente processadas.
