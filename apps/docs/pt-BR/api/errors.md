---
title: "Códigos de erro"
description: "O formato do corpo de erro, os códigos estáveis e o que fazer em cada caso."
i18n_source_hash: 7e48ef36024d
i18n_provenance: machine
i18n_output_hash: e3584e2a7488
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
|--------|---------|------------|
| `CANCELED` | O job foi cancelado por um usuário. Não é um status HTTP. Os eventos de progresso trazem `phase: failed` com este código. | Trate como um cancelamento do usuário. Não tente novamente de forma automática. |
| `INPUT_MISSING` | A entrada foi removida antes da execução do job. | Envie o arquivo novamente. |
| `ENGINE_UNAVAILABLE` | Um mecanismo necessário não pôde ser iniciado no servidor. | Tente novamente depois que um administrador reparar a instalação. |
| `JOB_STALLED` | Não é retornado aos clientes; identifica o relatório de erros do servidor. O worker perdeu o bloqueio do job mais vezes do que a fila permite, geralmente porque o servidor foi reiniciado ou ficou sem memória ou CPU. O job falha com uma mensagem informando que foi interrompido. | Tente novamente. Se continuar acontecendo, dê mais memória ao servidor ou reduza `CONCURRENT_JOBS`. |

## Autenticação e MFA {#mfa-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | A política de MFA exige cadastro, e esta instância não pode cadastrar o usuário (sem licença enterprise). Instâncias licenciadas retornam 200 com `requiresMfaEnrollment: true` e guiam o usuário pelo cadastro. | Não tente novamente. Um administrador precisa alterar a política ou usar a CLI de recuperação offline. |
| `MFA_POLICY_UNAVAILABLE` | 503 | O servidor não conseguiu ler a política de MFA durante o login. | Tente o login novamente em instantes. |
| `INVALID_CODE` | 401 | O código TOTP ou de recuperação está errado. | Peça um código novo ao usuário e tente novamente. Falhas repetidas terminam em `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Códigos errados demais. O desafio é descartado. | Inicie o login novamente para obter um novo desafio. |
| `MFA_EXPIRED` | 401 | O desafio de MFA ou de cadastro expirou ou não corresponde. | Inicie o login novamente. |
| `MFA_NOT_CONFIGURED` | 401 | A conta não tem segredo TOTP, então não é possível verificar um código. | Cadastre a MFA antes de fazer login com um código. |
| `MFA_ALREADY_ENABLED` | 409 | A MFA já está ativa na conta. | Não faça o cadastro novamente. |
| `NO_PENDING_ENROLLMENT` | 400 | Uma confirmação de cadastro chegou sem nenhum cadastro pendente. | Chame primeiro o endpoint de cadastro. |
| `MFA_NOT_ENABLED` | 400 | A ação exige que a MFA esteja ativada, e ela está desativada para este usuário. | Ignore a ação ou ative a MFA primeiro. |
| `MFA_DECRYPTION_FAILED` | 500 | O segredo TOTP armazenado não pode ser descriptografado. | Ação do operador. Isso geralmente significa que a chave de criptografia mudou. Verifique `DATA_ENCRYPTION_KEY` e `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Um valor armazenado (uma configuração, um cabeçalho de autenticação de webhook ou um segredo TOTP) não pode ser descriptografado. | Ação do operador, como acima. Não tente novamente. |
| `IDLE_TIMEOUT` | 401 | A sessão expirou após um período de inatividade. | Faça login novamente. |
| `INVALID_PASSWORD` | 401 | A senha atual está errada em uma alteração de senha. | Peça a senha atual ao usuário. |
| `PASSWORD_CHANGED` | 409 | A senha foi alterada em outra sessão, ou um administrador a redefiniu, enquanto esta requisição estava em andamento. | Faça login novamente. |
| `OIDC_NO_PASSWORD` | 400 | Foi solicitada uma alteração ou redefinição de senha para uma conta criada por SSO. | Direcione o usuário ao provedor de identidade. |

## OIDC {#oidc-codes}

Falhas de OIDC durante o login não retornam um corpo JSON. A rota de login redireciona para a página de login com um motivo genérico, e o log de auditoria registra o código. A rota de logout ainda encerra a sessão local quando o provedor de identidade não pode ser alcançado.

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Nenhum (redirecionamento) | A URL do emissor é `http`, mas `EXTERNAL_URL` é `https`, então o cliente recusa a descoberta. | Administrador: sirva o emissor por `https` ou execute a instância por `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Nenhum (redirecionamento) | A descoberta do emissor expirou. | Verifique se o servidor consegue alcançar o emissor e tente novamente. |
| `OIDC_DISCOVERY_FAILED` | Nenhum (redirecionamento) | A descoberta falhou por outro motivo. | Verifique a URL do emissor e o acesso de saída do servidor. |
| `OIDC_END_SESSION_INVALID` | Nenhum (o logout continua) | O `end_session_endpoint` do provedor de identidade não é uma URL válida. A sessão local ainda é encerrada. | Administrador: corrija os metadados do provedor. |
| `OIDC_END_SESSION_SCHEME` | Nenhum (o logout continua) | O `end_session_endpoint` usa um esquema que o servidor não permite. A sessão local ainda é encerrada. | Administrador: corrija os metadados do provedor. |

## SAML {#saml-codes}

Falhas de SAML não definem um `code`. Uma asserção com falha redireciona para a página de login com `saml_auth_failed`, e o evento de auditoria `SAML_LOGIN_FAILED` registra o motivo.

## SCIM {#scim-codes}

As rotas SCIM respondem com o envelope de erro da RFC 7644 (`schemas`, `detail`, `status` e, às vezes, `scimType`). Elas não definem `code`. Use o status HTTP para ramificar a lógica.

## Equipes, funções e usuários {#team-role-codes}

Nomes duplicados de equipe ou função retornam o genérico `CONFLICT`, e uma equipe ou função inexistente retorna `NOT_FOUND`.

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | A função de quem chama não permite a alteração. O alvo está acima da autoridade de quem chama, a função é nativa ou a requisição concede permissões que quem chama não possui. | Não tente novamente. Peça a um usuário com mais autoridade. |
| `UNKNOWN_ROLE` | 400 | O ID da função não corresponde a uma função existente. | Corrija o ID da função. Liste as funções para encontrá-lo. |
| `UNKNOWN_TEAM` | 400 | O ID da equipe não corresponde a uma equipe existente. | Corrija o ID da equipe. |
| `SELF_DEMOTE` | 400 | Um administrador tentou remover a própria função de administrador. | Peça a outro administrador que faça a alteração. |
| `SELF_DELETE` | 400 | Um administrador tentou excluir a própria conta. | Peça a outro administrador que a exclua. |
| `LAST_ADMIN` | 400 nas rotas de usuário, 409 nas rotas de limpeza GDPR | A alteração deixaria a instância sem administrador, ou limparia uma equipe que contém todos os administradores. | Torne outro usuário administrador primeiro. |
| `USER_LIMIT_REACHED` | 403 | A instância atingiu o limite de `MAX_USERS`. | Remova um usuário ou aumente `MAX_USERS`. |

## Recursos e pacotes de IA {#feature-codes}

Ferramentas, execuções em lote e pipelines que precisam de um pacote de IA opcional usam estes códigos.

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501, ou 400 no modo de rosto do Smart Crop | A ferramenta, ou uma etapa de um pipeline ou lote, precisa de um pacote que não está instalado. O corpo inclui `feature` (o ID do pacote) e `featureName`. | Instale o pacote em Configurações e tente novamente. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Uma instalação ou importação offline foi recusada porque as bibliotecas x86-64 do pacote precisam de AVX e a CPU deste servidor não tem. Nada foi baixado nem instalado. O corpo inclui `feature` (o ID do pacote) e `reason` (`cpu-no-avx`). `GET /api/v1/features` informa o mesmo pacote com `compatibility: "incompatible"` e `compatibilityReason: "cpu-no-avx"`. | Execute o SnapOtter em uma CPU com AVX ou em arm64. Os outros pacotes continuam sendo instalados. |
| `FEATURE_INSTALL_BUSY` | 409 | Um cancelamento foi recusado porque o instalador está gravando no ambiente de IA compartilhado, e interrompê-lo ali quebraria todas as ferramentas de IA instaladas. | Espere a instalação terminar e, se não quiser o pacote, desinstale-o depois. |
| `FEATURE_INCOMPATIBLE` | 501, ou 400 quando o Fast OCR recebe um idioma que não consegue ler | O recurso instalado não consegue atender à qualidade ou ao idioma solicitado. | Altere a configuração ou instale um pacote que ofereça suporte. |
| `ENGINE_UNAVAILABLE` | 503 | Um mecanismo necessário não pôde ser iniciado, ou um runtime de OCR foi removido depois que a requisição foi validada. | Tente novamente depois que um administrador reparar ou reinstalar o recurso. |
| `BROWSER_NOT_AVAILABLE` | 503 | O Chromium não está instalado, então HTML para imagem não pode ser executado. | Peça a um administrador que instale o navegador. |
| `BROWSER_CRASHED` | 503 | O navegador de capturas de tela travou durante a renderização. | Tente a requisição novamente. |

## Ferramentas {#tool-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | A entrada enviada foi removida antes da execução do job. | Envie o arquivo novamente e submeta o job. |
| `ANALYSIS_EXPIRED` | 410 | A análise da foto de passaporte expirou antes da geração. | Analise a foto novamente e depois gere. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | O resultado da remoção de fundo expirou antes da etapa seguinte. | Remova o fundo novamente. |
| `NOT_ANIMATED` | 400 | O Remove GIF Background recebeu uma imagem estática. | Use Remove Background para imagens estáticas. |
| `TOO_MANY_FRAMES` | 400 | A animação tem mais quadros do que o servidor permite (`GIF_BG_MAX_FRAMES`). | Envie uma animação mais curta ou peça a um administrador que aumente o limite. |
| `TOO_MANY_PIXELS` | 400 | O canvas da animação multiplicado pelo número de quadros ultrapassa o limite do servidor: 268.402.689 pixels (16383 x 16383) para o Remove GIF Background, ou o limite de carga de GIF para as outras ferramentas de animação. | Envie menos quadros ou uma animação menor. |
| `MULTI_FRAME_UNSUPPORTED` | 400 | Uma ferramenta de imagem com IA recebeu um TIFF de várias páginas ou um GIF ou WebP animado, e o formato de saída manteria todos os quadros. Essas ferramentas executam o modelo em uma imagem por vez. | Divida o arquivo em imagens separadas. Quando a ferramenta tem uma configuração de formato de saída, um formato estático como PNG processa apenas o primeiro quadro. |
| `IMAGE_TOO_LARGE` | 400 | A imagem tem mais pixels do que o decodificador aceita. | Envie uma imagem menor. |
| `SVG_TOO_COMPLEX` | 400 | O SVG não terminou de ser rasterizado dentro de `JOB_TIMEOUT_FAST_S`. Filtros em formas que `<use>` repete são a causa mais comum, já que cada cópia repinta o filtro. | Simplifique os filtros ou as formas repetidas, ou peça a um administrador que aumente o limite. |
| `RESULT_TOO_LARGE` | 400 | As configurações produziriam uma imagem maior do que o codificador ou o limite de pixels permite. | Use uma imagem menor ou configurações que gerem um resultado menor. |
| `DOCUMENT_UNREADABLE` | 400 | O LibreOffice ou o pandoc não conseguiu abrir o documento. Ele pode estar danificado, protegido por senha ou não estar no formato indicado pela extensão. | Verifique se o arquivo abre em um aplicativo de escritório e envie novamente. |
| `PDF_DAMAGED` | 400 | O mecanismo de PDF encontrou uma estrutura de documento corrompida. | Passe o arquivo pelo Repair PDF e tente novamente. |
| `PDF_PASSWORD_PROTECTED` | 400 | O PDF está criptografado e esta ferramenta não consegue abri-lo. | Desbloqueie-o primeiro com o Unlock PDF. |
| `NO_AUDIO_TRACK` | 400 | O arquivo não tem fluxo de áudio para uma ferramenta de áudio usar. | Envie um arquivo que tenha áudio. |
| `MEDIA_UNDECODABLE` | 400 | O ffmpeg não conseguiu ler o áudio ou o vídeo: não encontrou pacotes, nem parâmetros de codec, nem o átomo `moov`, ou encontrou dados que não consegue interpretar. | Verifique se o arquivo toca em um reprodutor de mídia ou exporte-o novamente, e tente de novo. |
| `ENCODED_TEXT_INVALID` | 400 | O Base64 Encode / Decode recebeu uma entrada que não é Base64. Espaços em branco são ignorados e são aceitos tanto o alfabeto padrão quanto o seguro para URL. | Verifique se o texto tem caracteres soltos ou o final cortado. |
| `DECODED_DATA_NOT_TEXT` | 400 | O Base64 é válido, mas é decodificado para dados binários, não para texto UTF-8. | Decodifique-o com uma ferramenta que salve um arquivo em vez de mostrar texto. |
| `PAGE_OUT_OF_RANGE` | 400 | O intervalo de páginas cita uma página que o PDF não tem. | Verifique o número de páginas e envie um intervalo dentro dele. |
| `INVALID_PAGE_RANGE` | 400 | O intervalo de páginas não tem sintaxe válida. | Use números de página como `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | O Remove Pages foi solicitado a remover todas as páginas. | Mantenha pelo menos uma página. |
| `NESTING_TOO_DEEP` | 400 | O JSON ou XML está aninhado em mais de 100 níveis. | Simplifique a estrutura do documento e depois converta. |
| `IMAGE_UNDECODABLE` | 400 | A imagem não pode ser decodificada ou suas dimensões não podem ser lidas. O arquivo pode estar danificado ou usar uma codificação que o decodificador não suporta. | Exporte a imagem novamente a partir de outro aplicativo ou converta-a primeiro para PNG ou JPEG. |
| `INVALID_SETTINGS` | 400 | Uma configuração está fora do intervalo ou não se adapta a este arquivo: um corte fora da imagem, um redimensionamento para zero, um quadro de GIF que a animação não tem, uma especificação de passaporte que não existe. O texto de `error` indica a configuração. | Corrija a configuração indicada em `error` e tente novamente. |
| `CHART_DATA_INVALID` | 400 | O Chart Maker não conseguiu ler dados de gráfico do arquivo: o CSV ou JSON não é interpretado, não tem coluna numérica, tem mais de 100 linhas ou tem um valor negativo. O texto de `error` informa qual. | Envie CSV ou JSON com até 100 linhas, cada uma com um rótulo e um número maior ou igual a zero. |
| `NO_FACE_DETECTED` | 400 | O Passport Photo não encontrou nenhum rosto na imagem. | Envie uma foto nítida, de frente, com boa iluminação. |
| `TARGET_SIZE_UNREACHABLE` | 400 | A compressão, ou o limite de tamanho de uma foto de passaporte, não consegue deixar o arquivo abaixo do tamanho solicitado, mesmo depois de reduzi-lo. | Peça um tamanho-alvo maior ou corte a imagem primeiro. |
| `TOO_MANY_PAGES` | 400 | O OCR foi solicitado para mais páginas do que processa em um único job. | Selecione menos páginas com o intervalo de páginas. |
| `OCR_OUTPUT_TOO_LARGE` | 500 | O OCR de um TIFF de várias páginas leu mais de 1.000.000 de bytes de texto nas páginas, mais do que um resultado consegue armazenar. | Divida o TIFF em arquivos menores e execute o OCR em cada um. |
| `METADATA_DAMAGED` | 400 | O Edit Metadata encontrou os dados EXIF existentes da imagem danificados, então não consegue reescrevê-los com segurança. | Remova os metadados primeiro com o Remove Image Metadata e depois edite. |
| `REMOTE_RESOURCES_DISABLED` | 400 | O HTML ou Markdown para PDF encontrou uma referência a uma imagem, folha de estilo ou fonte na rede, que o servidor não busca. | Incorpore o recurso ao arquivo (por exemplo, como uma URI `data:`) e tente novamente. |

## Arquivos {#file-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Salvar em Arquivos excederia a cota de armazenamento do usuário. | Exclua arquivos ou peça mais espaço a um administrador. |
| `INVALID_STORED_NAME` | 400 | O servidor rejeitou o nome de um arquivo armazenado. | Envie o arquivo novamente. |

## Pipelines e lote {#pipeline-codes}

Requisições de pipeline e de lote retornam os códigos de recurso acima para cada etapa que precisa de um pacote. Um ID de job que já está em uso retorna `CONFLICT` com status 409. Envie um novo ID de job.

## Configurações {#settings-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | A chave não é uma configuração conhecida. | Verifique o nome da chave. |
| `READONLY_SETTING` | 400 | A configuração não pode ser alterada pela API. | Altere-a pelo ambiente ou pela interface de administração. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | O novo valor entra em conflito com outras configurações. O corpo indica a configuração em `setting` e lista os problemas em `validationErrors`. | Corrija as configurações listadas e tente novamente. |
| `SETTING_DECRYPTION_FAILED` | 500 | Uma configuração armazenada não pode ser descriptografada. | Ação do operador, como para `DECRYPTION_FAILED`. |

Para `VALIDATION_ERROR` em uma configuração, `details` contém os problemas do esquema.

## Enterprise {#enterprise-codes}

| `code` | Status | Significado | O que fazer |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | A configuração ou política exige uma licença enterprise, como a imposição de SSO ou a política de MFA. | Use uma instância licenciada ou deixe a configuração desativada. |
| `IP_NOT_ALLOWED` | 403 | O endereço IP da requisição não está na lista de permissões. | Conecte-se a partir de uma rede permitida. |
| `INVALID_CIDR` | 400 | Uma entrada da lista de permissões não é um CIDR válido. A mensagem lista as entradas inválidas. | Corrija as entradas e salve novamente. |
| `SELF_LOCKOUT` | 400 | Salvar a lista de permissões bloquearia o IP atual de quem chama. | Adicione primeiro o seu IP atual à lista. |

As rotas de limpeza GDPR retornam um `CONFLICT` simples com status 409 quando um usuário ou uma equipe está sob retenção legal.

## Códigos que os clientes não recebem {#internal-codes}

Estes códigos existem no código-fonte do servidor para logs, telemetria ou erros do próprio Fastify. Um cliente não os recebe em um corpo de resposta nem em uma linha de job, então não escreva lógica de cliente com base neles.

| `code` | Para onde vai |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Reportado ao rastreamento de erros pelo avaliador de alertas. O cabeçalho de autenticação de um webhook de alerta não pode ser descriptografado. |
| `SIEM_DECRYPTION_FAILED` | Reportado ao rastreamento de erros pelo encaminhamento para SIEM. O cabeçalho de autenticação do SIEM não pode ser descriptografado. |
| `WEBHOOK_DECRYPTION_FAILED` | Reportado ao rastreamento de erros. A requisição que teve a mesma falha responde com `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Reportado ao rastreamento de erros quando um upload em preparação não pode ser removido. |
| `RETENTION_DEADLINE_BACKFILLED` | Reportado ao rastreamento de erros pela varredura de TTL do armazenamento quando ela preenche o prazo de retenção de equipe ausente de um job concluído. Os arquivos do job passam então a seguir a retenção da equipe. |
| `USERNAME_RACE_EXHAUSTED` | Gerado quando a criação automática por SSO perde a disputa pelo nome de usuário em todas as novas tentativas. A página de login mostra um erro no lugar. |
| `ERR_OUT_OF_RANGE` | Lançado pelo leitor de armazenamento de objetos para um intervalo de bytes inválido. |
| `ETIMEDOUT` | Definido no erro de timeout de uma exportação GDPR. A exportação falha e pode ser solicitada novamente. |
| `FST_REQ_FILE_TOO_LARGE` | Código do Fastify para um upload acima do limite. Os clientes recebem um 413 com `PAYLOAD_TOO_LARGE`, ou a própria mensagem 413 da rota. |
| `TARGET_SIZE_EXCEEDED` | Lançado quando uma compressão com tamanho-alvo não atinge o alvo. O erro não tem status nem código, então os clientes recebem uma falha genérica. |
| `OCR_CACHE_PERMISSIONS` | Reportado ao rastreamento de erros como falha operacional quando o volume de dados de IA deixa o cache do runtime de OCR gravável por todos. O job de instalação falha com uma mensagem que cita o problema de armazenamento. |
| `OCR_RUNTIME_UNREACHABLE` | Reportado ao rastreamento de erros como falha operacional quando o servidor nunca alcançou huggingface.co para baixar o runtime de OCR. O job de instalação falha com uma mensagem sobre acesso à rede, `HTTPS_PROXY`, `HF_ENDPOINT` e importação offline. |
