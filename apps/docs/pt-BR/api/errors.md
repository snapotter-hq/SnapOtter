---
title: "Códigos de erro"
description: "O formato do corpo de erro, os códigos estáveis e o que fazer em cada caso."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: f617362c3779
i18n_hash_version: 2
---

# Códigos de erro {#error-codes}

Toda resposta de erro JSON tem o mesmo formato:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Campo | Sempre presente | Significado |
|-------|----------------|---------|
| `error` | Sim | Uma mensagem legível por pessoas. Pode ser exibida aos usuários. Não faça parsing dela. |
| `code` | Sim | Um código estável e legível por máquina. Use-o para ramificar a lógica. |
| `requestId` | Sim | O ID da requisição no servidor. Informe-o ao relatar um problema; ele corresponde ao log do servidor. |
| `details` | Às vezes | Mais contexto para alguns erros 4xx, como a mensagem de validação. |

As mensagens podem mudar entre versões. Os códigos não mudam, então escreva a lógica do cliente com base em `code`.

## Códigos derivados do status HTTP {#status-codes}

Quando uma rota não define seu próprio código, o servidor deriva um a partir do status:

| Status HTTP | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Qualquer outro 4xx recorre a `BAD_REQUEST`, e qualquer outro 5xx a `INTERNAL_ERROR`.

Uma rota pode definir um código mais específico, e então a resposta traz esse código no lugar. Por exemplo, uma ferramenta que não pode ser executada porque seu pacote de IA está ausente retorna um código específico do recurso. Esses códigos são descritos junto com o recurso que os gera.

## Autenticação e acesso {#auth-codes}

| `code` | Status | O que fazer |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Envie `Authorization: Bearer <token>` com um token de sessão ou uma chave de API (`si_...`). |
| `FORBIDDEN` | 403 | A credencial é válida, mas não tem a permissão. Peça a permissão a um administrador. |
| `MUST_CHANGE_PASSWORD` | 403 | A conta precisa alterar a senha antes de poder chamar outros endpoints. Chame `POST /api/auth/change-password` com o token de sessão e tente novamente. |
| `USER_DISABLED` | 403 | A conta está desativada. Um administrador precisa reativá-la. |
| `LOGIN_THROTTLED` | 429 | Tentativas de login malsucedidas demais. Aguarde antes de tentar novamente. |
| `VALIDATION_ERROR` | 400 | O corpo ou os parâmetros da requisição falharam na validação. `details` indica o problema. |

A conta de administrador do primeiro uso é `admin` com a senha `admin`, a menos que `DEFAULT_USERNAME` ou `DEFAULT_PASSWORD` a tenha alterado. A menos que `SKIP_MUST_CHANGE_PASSWORD` esteja definido, essa conta recebe `MUST_CHANGE_PASSWORD` em toda chamada até que a senha seja alterada.

## Jobs {#job-codes}

Um job que falha informa o motivo no próprio job, não no erro HTTP. Leia `error.code` e `error.message` em `GET /api/v1/jobs/{jobId}`. Veja [Acompanhamento de progresso](/pt-BR/api/rest#progress-tracking).

## Ainda não catalogados {#not-yet-cataloged}

Os códigos gerados por recursos individuais (por exemplo criptografia, OIDC, SCIM e equipes) ainda não são descritos nesta página. Cada um é um código estável; trate um código não listado como opaco e lide com ele pelo status.
