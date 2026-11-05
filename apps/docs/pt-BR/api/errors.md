---
title: "Códigos de erro"
description: "O formato do corpo de erro, os códigos estáveis e o que fazer em cada caso."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: 5ca3fe88f4cb
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

Um job com falha mantém `error.code` apenas quando a falha é um erro de entrada ou uma falha do servidor. As demais falhas trazem somente a mensagem.

| `code` | Significado | O que fazer |
|--------|-------------|-------------|
| `CANCELED` | O job foi cancelado por um usuário. Não é um status HTTP. Os eventos de progresso trazem `phase: failed` com este código. | Trate como um cancelamento do usuário. Não tente novamente de forma automática. |
| `INPUT_MISSING` | A entrada foi removida antes da execução do job. | Envie o arquivo novamente. |
| `ENGINE_UNAVAILABLE` | Um mecanismo necessário não conseguiu iniciar no servidor. | Tente novamente depois que um administrador reparar a instalação. |

## Autenticação e MFA {#mfa-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | A política de MFA exige registro, e esta instância não consegue registrar o usuário (sem licença enterprise). Instâncias licenciadas retornam 200 com `requiresMfaEnrollment: true` e conduzem o usuário pelo registro. | Não tente novamente. Um administrador precisa alterar a política ou usar a CLI de recuperação offline. |
| `MFA_POLICY_UNAVAILABLE` | 503 | O servidor não conseguiu ler a política de MFA durante o login. | Tente o login novamente em instantes. |
| `INVALID_CODE` | 401 | O código TOTP ou de recuperação está errado. | Peça um código novo ao usuário e tente novamente. Falhas repetidas terminam em `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Códigos errados demais. O desafio é descartado. | Inicie o login novamente para obter um novo desafio. |
| `MFA_EXPIRED` | 401 | O desafio de MFA ou de registro expirou ou não corresponde. | Inicie o login novamente. |
| `MFA_NOT_CONFIGURED` | 401 | A conta não tem segredo TOTP, então não é possível verificar um código. | Registre a MFA antes de entrar com um código. |
| `MFA_ALREADY_ENABLED` | 409 | A MFA já está ativa na conta. | Não registre novamente. |
| `NO_PENDING_ENROLLMENT` | 400 | Chegou uma confirmação de registro sem nenhum registro pendente. | Chame primeiro o endpoint de registro. |
| `MFA_NOT_ENABLED` | 400 | A ação exige que a MFA esteja ativada, e ela está desativada para este usuário. | Pule a ação ou ative a MFA primeiro. |
| `MFA_DECRYPTION_FAILED` | 500 | O segredo TOTP armazenado não pode ser descriptografado. | Ação do operador. Em geral isso significa que a chave de criptografia mudou. Verifique `DATA_ENCRYPTION_KEY` e `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Um valor armazenado (uma configuração, um cabeçalho de autenticação de webhook ou um segredo TOTP) não pode ser descriptografado. | Ação do operador, como acima. Não tente novamente. |
| `IDLE_TIMEOUT` | 401 | A sessão expirou após um período de inatividade. | Entre novamente. |
| `INVALID_PASSWORD` | 401 | A senha atual está errada em uma troca de senha. | Peça ao usuário a senha atual. |
| `PASSWORD_CHANGED` | 409 | A senha foi alterada em outra sessão, ou um administrador a redefiniu, enquanto esta requisição estava em execução. | Entre novamente. |
| `OIDC_NO_PASSWORD` | 400 | Foi solicitada uma troca ou redefinição de senha para uma conta criada por SSO. | Direcione o usuário ao provedor de identidade. |

## OIDC {#oidc-codes}

Falhas de OIDC durante o login não retornam um corpo JSON. A rota de login redireciona para a página de login com um motivo genérico, e o log de auditoria registra o código. A rota de logout ainda encerra a sessão local quando o provedor de identidade não pode ser alcançado.

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Nenhum (redirecionamento) | A URL do emissor é `http`, mas `EXTERNAL_URL` é `https`, então o cliente recusa a descoberta. | Administrador: sirva o emissor por `https` ou execute a instância por `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Nenhum (redirecionamento) | A descoberta do emissor expirou. | Verifique se o servidor consegue alcançar o emissor e tente novamente. |
| `OIDC_DISCOVERY_FAILED` | Nenhum (redirecionamento) | A descoberta falhou por outro motivo. | Verifique a URL do emissor e o acesso de saída do servidor. |
| `OIDC_END_SESSION_INVALID` | Nenhum (o logout continua) | O `end_session_endpoint` do provedor de identidade não é uma URL válida. A sessão local ainda é limpa. | Administrador: corrija os metadados do provedor. |
| `OIDC_END_SESSION_SCHEME` | Nenhum (o logout continua) | O `end_session_endpoint` usa um esquema que o servidor não permite. A sessão local ainda é limpa. | Administrador: corrija os metadados do provedor. |

## SAML {#saml-codes}

Falhas de SAML não definem um `code`. Uma asserção com falha redireciona para a página de login com `saml_auth_failed`, e o evento de auditoria `SAML_LOGIN_FAILED` registra o motivo.

## SCIM {#scim-codes}

As rotas SCIM respondem com o envelope de erro da RFC 7644 (`schemas`, `detail`, `status` e, às vezes, `scimType`). Elas não definem `code`. Ramifique pelo status HTTP.

## Equipes, funções e usuários {#team-role-codes}

Nomes duplicados de equipe ou função retornam o `CONFLICT` genérico, e uma equipe ou função inexistente retorna `NOT_FOUND`.

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `ESCALATION_DENIED` | 403 | A função de quem chama não permite a alteração. O alvo está acima da autoridade de quem chama, a função é nativa, ou a requisição concede permissões que quem chama não possui. | Não tente novamente. Peça a um usuário com mais autoridade. |
| `UNKNOWN_ROLE` | 400 | O ID da função não corresponde a nenhuma função existente. | Corrija o ID da função. Liste as funções para encontrá-lo. |
| `UNKNOWN_TEAM` | 400 | O ID da equipe não corresponde a nenhuma equipe existente. | Corrija o ID da equipe. |
| `SELF_DEMOTE` | 400 | Um administrador tentou remover a própria função de administrador. | Peça a outro administrador que faça a alteração. |
| `SELF_DELETE` | 400 | Um administrador tentou excluir a própria conta. | Peça a outro administrador que a exclua. |
| `LAST_ADMIN` | 400 nas rotas de usuário, 409 nas rotas de eliminação do GDPR | A alteração deixaria a instância sem administrador, ou eliminaria uma equipe que reúne todos os administradores. | Torne outro usuário administrador primeiro. |
| `USER_LIMIT_REACHED` | 403 | A instância atingiu o limite de `MAX_USERS`. | Remova um usuário ou aumente `MAX_USERS`. |

## Recursos e pacotes de IA {#feature-codes}

Ferramentas, execuções em lote e pipelines que precisam de um pacote de IA opcional usam estes códigos.

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `FEATURE_NOT_INSTALLED` | 501 | A ferramenta, ou uma etapa de um pipeline ou lote, precisa de um pacote que não está instalado. O corpo inclui `feature` (o ID do pacote) e `featureName`. | Instale o pacote em Configurações e tente novamente. |
| `FEATURE_INCOMPATIBLE` | 501 | O recurso instalado não consegue atender à qualidade ou ao idioma solicitado. | Altere a configuração ou instale um pacote que ofereça suporte a isso. |
| `ENGINE_UNAVAILABLE` | 503 | Um mecanismo necessário não conseguiu iniciar, ou um runtime de OCR foi removido depois que a requisição foi validada. | Tente novamente depois que um administrador reparar ou reinstalar o recurso. |
| `BROWSER_NOT_AVAILABLE` | 503 | O Chromium não está instalado, então a conversão de HTML em imagem não pode ser executada. | Peça a um administrador que instale o navegador. |
| `BROWSER_CRASHED` | 503 | O navegador de captura travou durante a renderização. | Tente a requisição novamente. |

## Ferramentas {#tool-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `INPUT_MISSING` | 410 | A entrada enviada foi removida antes da execução do job. | Envie o arquivo novamente e submeta o job. |
| `ANALYSIS_EXPIRED` | 410 | A análise da foto de passaporte expirou antes da geração. | Analise a foto novamente e depois gere. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | O resultado da remoção de fundo expirou antes da etapa seguinte. | Remova o fundo novamente. |
| `NOT_ANIMATED` | 400 | O Remove GIF Background recebeu uma imagem estática. | Use o Remove Background para imagens estáticas. |
| `TOO_MANY_FRAMES` | 400 | A animação tem mais quadros do que o servidor permite (`GIF_BG_MAX_FRAMES`). | Envie uma animação mais curta ou peça a um administrador que aumente o limite. |

## Arquivos {#file-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Salvar em Arquivos excederia a cota de armazenamento do usuário. | Exclua arquivos ou peça mais espaço a um administrador. |
| `INVALID_STORED_NAME` | 400 | O servidor rejeitou o nome de um arquivo armazenado. | Envie o arquivo novamente. |

## Pipelines e lotes {#pipeline-codes}

Requisições de pipeline e de lote retornam os códigos de recurso acima para cada etapa que precisa de um pacote. Um ID de job que já está em uso retorna `CONFLICT` com status 409. Envie um novo ID de job.

## Configurações {#settings-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `UNKNOWN_SETTING` | 400 | A chave não é uma configuração conhecida. | Verifique o nome da chave. |
| `READONLY_SETTING` | 400 | A configuração não pode ser alterada pela API. | Altere-a pelo ambiente ou pela interface de administração. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | O novo valor entra em conflito com outras configurações. O corpo indica a configuração em `setting` e lista os problemas em `validationErrors`. | Corrija as configurações listadas e tente novamente. |
| `SETTING_DECRYPTION_FAILED` | 500 | Uma configuração armazenada não pode ser descriptografada. | Ação do operador, como em `DECRYPTION_FAILED`. |

Para `VALIDATION_ERROR` em uma configuração, `details` contém os problemas do esquema.

## Enterprise {#enterprise-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|-------------|-------------|
| `FEATURE_NOT_LICENSED` | 403 | A configuração ou política exige uma licença enterprise, como a exigência de SSO ou a política de MFA. | Use uma instância licenciada ou deixe a configuração desativada. |
| `IP_NOT_ALLOWED` | 403 | O endereço IP da requisição não está na lista de permissões. | Conecte-se a partir de uma rede permitida. |
| `INVALID_CIDR` | 400 | Uma entrada da lista de permissões não é um CIDR válido. A mensagem lista as entradas inválidas. | Corrija as entradas e salve novamente. |
| `SELF_LOCKOUT` | 400 | Salvar a lista de permissões bloquearia o IP atual de quem chama. | Adicione primeiro o seu IP atual à lista. |

As rotas de eliminação do GDPR retornam um `CONFLICT` simples com status 409 quando um usuário ou equipe está sob retenção legal.

## Códigos que os clientes não recebem {#internal-codes}

Estes códigos existem no código-fonte do servidor para logs, telemetria ou para os erros do próprio Fastify. Um cliente não os recebe em um corpo de resposta nem em uma linha de job, então não escreva lógica de cliente com base neles.

| `code` | Para onde vai |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Informado ao rastreamento de erros pelo avaliador de alertas. O cabeçalho de autenticação de um webhook de alerta não pode ser descriptografado. |
| `SIEM_DECRYPTION_FAILED` | Informado ao rastreamento de erros pelo encaminhamento ao SIEM. O cabeçalho de autenticação do SIEM não pode ser descriptografado. |
| `WEBHOOK_DECRYPTION_FAILED` | Informado ao rastreamento de erros. A requisição que encontrou a mesma falha responde com `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Informado ao rastreamento de erros quando um upload em preparação não pode ser removido. |
| `USERNAME_RACE_EXHAUSTED` | Gerado quando a criação automática por SSO perde a disputa pelo nome de usuário em todas as tentativas. A página de login exibe um erro no lugar. |
| `ERR_OUT_OF_RANGE` | Lançado pelo leitor do armazenamento de objetos para um intervalo de bytes inválido. |
| `ETIMEDOUT` | Definido no erro de tempo esgotado de uma exportação do GDPR. A exportação falha e pode ser solicitada novamente. |
| `FST_REQ_FILE_TOO_LARGE` | Código do Fastify para um upload acima do limite. Os clientes recebem um 413 com `PAYLOAD_TOO_LARGE`, ou a própria mensagem 413 da rota. |
| `TARGET_SIZE_EXCEEDED` | Lançado quando uma compressão para tamanho-alvo não atinge o alvo. O erro não tem status nem código, então os clientes recebem uma falha genérica. |
