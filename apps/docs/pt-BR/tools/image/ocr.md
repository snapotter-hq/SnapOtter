---
description: "Extraia texto de imagens usando reconhecimento óptico de caracteres com IA."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 6c013ab29044
---

# OCR / Extração de Texto {#ocr-text-extraction}

Extraia texto de imagens usando reconhecimento óptico de caracteres com IA. Suporta vários idiomas e níveis de qualidade.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processamento:** Resposta JSON síncrona. Se `clientJobId` for fornecido, o progresso também é reportado via SSE.

**Pacote de modelo:** `ocr` (5-6 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| quality | string | Não | `"balanced"` | Nível de qualidade: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Não | `"auto"` | Sugestão de idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Não | `true` | Pré-processar a imagem para melhor precisão do OCR |
| engine | string | Não | - | Obsoleto. Use `quality` em vez disso. Mapeia `tesseract` para `fast`, `paddleocr` para `balanced` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Resposta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progresso (SSE, opcional) {#progress-sse-optional}

Se um campo de formulário `clientJobId` for fornecido, os eventos de progresso são transmitidos:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notas {#notes}

- Requer que o pacote de modelo `ocr` esteja instalado (5-6 GB).
- O OCR retorna o texto extraído diretamente, em vez de uma URL de download da imagem.
- Usa uma cadeia de fallback: se um nível de qualidade superior falhar (por exemplo, um segfault do PaddleOCR), ele tenta automaticamente o próximo nível inferior.
- Se um nível retornar texto vazio sem falhar, ele também recorre ao próximo nível.
- Os níveis de qualidade mapeiam para os engines: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
