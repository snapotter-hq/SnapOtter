---
description: "Extraia texto de documentos PDF usando OCR com tecnologia de IA."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 42ac624970b5
---

# PDF OCR {#pdf-ocr}

Extraia texto de documentos PDF usando reconhecimento óptico de caracteres com tecnologia de IA. Oferece suporte a vários níveis de qualidade e idiomas. Requer que o pacote de recurso OCR esteja instalado.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings` opcional.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| quality | string | Não | `"balanced"` | Nível de qualidade do OCR: `fast`, `balanced`, `best` |
| language | string | Não | `"auto"` | Idioma do documento: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Não | `"all"` | Seleção de páginas, por exemplo `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
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
- Esta é uma ferramenta de IA que requer que o **pacote de recurso OCR** esteja instalado. Se o pacote não estiver instalado, a API retorna `501 Not Implemented`.
- O nível de qualidade `fast` usa um modelo mais leve para processamento mais rápido; `best` usa um modelo mais preciso ao custo de velocidade.
- A configuração de idioma `auto` tenta detectar o idioma do documento automaticamente.
- Você pode direcionar páginas específicas usando intervalos (`"1-3"`), listas separadas por vírgula (`"1,3,5"`) ou `"all"` para todas as páginas.
- Para PDFs que já contêm texto selecionável, considere usar a ferramenta [PDF to Text](./pdf-to-text), que é mais rápida.
