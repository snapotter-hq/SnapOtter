---
description: "Extraia texto de PDFs digitalizados localmente com Tesseract integrado ou o tempo de execução opcional de alta precisão RapidOCR."
i18n_output_hash: fb4274f84c52
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

Extraia texto de documentos PDF digitalizados página por página sem enviar o PDF para um serviço externo. A camada `fast` integrada usa Tesseract. As camadas opcionais `balanced` e `best` usam RapidOCR com modelos PP-OCR ONNX fixados.


<!-- korean-ocr-contract:start -->
::: info Compatibilidade do OCR em coreano
O OCR rápido oferece suporte a `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, mas não a coreano (`ko`). Coreano exige o pacote de OCR preciso e `balanced` ou `best`. O pacote funciona nos contêineres oficiais Linux amd64 e arm64, inclusive em hosts NVIDIA, onde o OCR continua na CPU. Sistemas não compatíveis recebem um erro explícito e nunca retornam silenciosamente para `fast`. Coreano com `fast` ou com o alias legado `tesseract` é rejeitado antes da fila com `FEATURE_INCOMPATIBLE` e `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings` opcional.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo PDF (multipart), codificado até 512 MiB; um limite inferior de upload do operador ainda se aplica |
| quality | string | Não | Dinâmico | Nível de qualidade OCR: `fast`, `balanced` ou `best` |
| language | string | Não | `"auto"` | Idioma do documento: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Não | `"all"` | Seleção de páginas, por exemplo `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | Não | Dependente do nível | Melhore o contraste local antes do reconhecimento. Fast aplica-o diretamente; Balanceado e Melhor retêm a variante somente quando a pontuação calibrada melhora o resultado. O padrão é `true` para `best` e `false` para `fast`/`balanced` |
| engine | string | Não | - | Alias ​​de compatibilidade obsoleta. Use `quality`. `tesseract` mapeia para `fast`; o valor legado `paddleocr` é mapeado para `balanced`, mas não carrega PaddlePaddle |

Quando `quality` e `engine` são omitidos, o SnapOtter escolhe o melhor nível disponível nesta ordem: `best`, `balanced`, `fast`. Para coreano, `fast` nunca é escolhido; usa-se `best`, depois `balanced`, ou é retornado o erro de instalação ou compatibilidade do runtime preciso.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Retorna `202 Accepted`. Acompanhe o progresso via SSE em `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato de entrada aceito: `.pdf`.
- `fast` está integrado e adiciona cerca de 25 MiB à imagem oficial. `balanced` e `best` requerem o pacote OCR preciso opcional (cerca de 208-234 MiB para download e 409-488 MiB instalados, dependendo do destino).
- O pacote preciso suporta Linux amd64 e arm64 e usa ONNX Runtime em CPU, inclusive em hosts NVIDIA.
- Um nível solicitado explicitamente nunca sofre downgrade silenciosamente. Se `balanced` ou `best` não estiver disponível, API retornará `501` com `FEATURE_NOT_INSTALLED` ou `FEATURE_INCOMPATIBLE`.
- As páginas PDF são rasterizadas em alta resolução antes de OCR. `best` executa os modelos PP-OCRv6 médios de maior precisão e pontua variantes de orientação e aprimoramento, melhorando o reconhecimento ao custo da velocidade.
- A configuração de idioma `auto` permite o reconhecimento em todo o conjunto de scripts suportados; uma dica explícita pode melhorar os resultados para um idioma de documento conhecido.
- Você pode direcionar páginas específicas usando intervalos (`"1-3"`), listas separadas por vírgula (`"1,3,5"`) ou `"all"` para todas as páginas.
- Uma solicitação pode processar no máximo 50 páginas. Os dados rasterizados rasterizados são limitados a 512 MiB e a resposta agregada UTF-8 OCR é limitada a 1.000.000 bytes; trabalhos acima do limite falham em vez de retornar texto parcial.
- Para PDFs que já contêm texto selecionável, considere usar a ferramenta [PDF to Text](./pdf-to-text), que é mais rápida.
