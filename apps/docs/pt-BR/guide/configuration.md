---
description: "Todas as variáveis de ambiente do SnapOtter com seus valores padrão. Configure autenticação, armazenamento, modelos de IA, análises e mais."
i18n_source_hash: 02edb8bd70e5
i18n_provenance: machine
i18n_output_hash: aae3030ecb46
i18n_hash_version: 2
---

# Configuração {#configuration}

Toda a configuração é feita por meio de variáveis de ambiente. Cada variável tem um padrão razoável, então o SnapOtter funciona de imediato sem que você defina nenhuma delas.

## Variáveis de ambiente {#environment-variables}

### Servidor {#server}

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `1349` | Porta em que o servidor escuta. |
| `HOST` | `0.0.0.0` | Endereço IP em que o servidor escuta. Em uma rede bridge (o padrão para `docker run` e Compose), mantenha `0.0.0.0` (ou `::`), ou as portas publicadas param de funcionar. Em uma instalação nativa ou em um contêiner na rede do host, `127.0.0.1` mantém a API fora da rede; coloque um proxy reverso à frente para acesso remoto. O [modo embutido](#embedded-mode) funciona apenas com `0.0.0.0`, `::` ou `127.0.0.1`, porque a verificação de inicialização dele chama `127.0.0.1`. Com qualquer outro endereço, incluindo `::1`, o contêiner nunca é considerado iniciado, e uma falha posterior o para em vez de reiniciar o servidor. Qualquer coisa que não seja um endereço IP, incluindo `localhost`, encerra o servidor na inicialização. |
| `BASE_PATH` | (vazio) | Caminho público da implantação, por exemplo `/snapotter`. Vazio ou `/` serve na raiz do domínio. Aplicado em tempo de execução; não é preciso recompilar a imagem. |
| `RATE_LIMIT_PER_MIN` | `1000` | Máximo de requisições por minuto por IP. Defina como 0 para desativar o limite de taxa. |
| `CORS_ORIGIN` | (vazio) | Origens permitidas para CORS, separadas por vírgula, ou vazio para aceitar apenas a mesma origem. |
| `LOG_LEVEL` | `info` | Nível de detalhe dos logs. Um entre: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quais peers podem definir o IP do cliente por meio de `X-Forwarded-For`. O padrão confia apenas em um peer de rede privada, então um proxy reverso em uma rede Docker ou LAN é confiável e o cabeçalho forjado de um cliente público não é. Defina `true` somente quando um proxy sob seu controle estiver à frente, em um endereço público. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (não definida) | Responde antecipadamente à pergunta sobre análises da primeira execução, para que ninguém seja perguntado. Sem ela, uma nova instância pergunta ao administrador e não envia nada até receber uma resposta. `off` a inicia com "Anonymous Product Analytics" desativado; `on` a inicia com ele ativado. A variável só preenche a configuração enquanto ninguém tiver escolhido um valor. Depois que a configuração é salva, por um administrador ou por esta variável, alterar a variável não tem efeito; um administrador ainda pode alterá-la em Settings > System > Privacy. |

### Autenticação {#authentication}

Os dois booleanos abaixo aceitam apenas `true` e `false`. Qualquer outro valor, `1` ou `yes` ou `on`, falha na validação e o servidor encerra antes de começar a escutar.

| Variável | Padrão | Descrição |
|---|---|---|
| `AUTH_ENABLED` | `true` | Exige login. Defina como `false` para rodar sem nenhuma conta, o que concede direitos de administrador a toda requisição, então mantenha isso em uma rede confiável. |
| `DEFAULT_USERNAME` | `admin` | Nome de usuário da conta de administrador inicial. Usado apenas na primeira execução. |
| `DEFAULT_PASSWORD` | `admin` | Senha da conta de administrador inicial. Altere-a após o primeiro login. |
| `MAX_USERS` | `0` (ilimitado) | Número máximo de contas de usuário registradas. Defina como 0 para ilimitado. |
| `SESSION_DURATION_HOURS` | `168` | Duração da sessão de login em horas (o padrão é 7 dias). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Defina como `true` para pular o aviso obrigatório de troca de senha no primeiro login. |

### Armazenamento {#storage}

| Variável | Padrão | Descrição |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` ou `s3`. S3 e MinIO exigem uma licença com o recurso s3_storage, além das variáveis `S3_*` abaixo. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | String de conexão do PostgreSQL e a conexão pela qual toda requisição é atendida. Na versão 2.3.0 e posteriores, defina também `DATABASE_MIGRATION_URL` e esta passa a ser a função de execução com privilégio mínimo, com DML nas tabelas do app e nada além disso. A stack Compose a aponta para o serviço `postgres`; deixe-a sem definir (junto com `REDIS_URL`) para obter o modo embutido. |
| `DATABASE_MIGRATION_URL` | (vazio) | Conexão privilegiada, usada apenas durante a inicialização para executar migrações e conceder permissões à função de execução, e então fechada antes da primeira requisição. Deixe vazia e o SnapOtter roda com uma única função, com `DATABASE_URL` fazendo as duas tarefas. Veja [Funções com privilégio mínimo](/pt-BR/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | String de conexão do Redis (usada para as filas de jobs do BullMQ). O Compose a aponta para o serviço `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Diretório de arquivos temporários durante o processamento. Limpo automaticamente. A imagem define `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Diretório de arquivos persistentes do usuário (imagens enviadas, resultados salvos). A imagem define `/data/files`. |

### Armazenamento de objetos S3 {#s3-object-storage}

Lido apenas quando `STORAGE_MODE=s3`. Se faltar qualquer uma das três obrigatórias, a inicialização falha com o nome da variável omitida.

| Variável | Padrão | Descrição |
|---|---|---|
| `S3_BUCKET` | (vazio) | Bucket que guarda uploads e saídas. Obrigatório. |
| `S3_ACCESS_KEY_ID` | (vazio) | Chave de acesso. Obrigatória. No contêiner, você pode montá-la como arquivo, por meio de `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (vazio) | Chave secreta. Obrigatória. Mesma convenção de arquivo: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Região do bucket. |
| `S3_ENDPOINT` | (vazio) | Endpoint personalizado para MinIO, R2, Backblaze e outros armazenamentos compatíveis com S3. Vazio significa AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Defina como `true` para MinIO e qualquer outro serviço que queira `endpoint/bucket/key` em vez de endereçamento virtual-host. |
| `S3_PREFIX` | (vazio) | Prefixo de chave, para que um mesmo bucket possa abrigar várias instâncias. |

### Criptografia em repouso {#encryption-at-rest}

| Variável | Padrão | Descrição |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (vazio) | 64 caracteres hexadecimais (32 bytes). Criptografa configurações sensíveis armazenadas no banco de dados. Qualquer valor que não tenha 64 caracteres hexadecimais é rejeitado na inicialização. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (vazio) | A chave que você está substituindo, no mesmo formato. Defina as duas durante uma rotação para que as linhas existentes ainda sejam descriptografadas, e depois remova esta. |

### Modo embutido {#embedded-mode}

Execute a imagem sem `DATABASE_URL` e sem `REDIS_URL` e ela inicia o próprio PostgreSQL 17 e Redis dentro do contêiner, vinculados ao loopback, com todos os dados no volume `/data`. Isso restaura a experiência de um único comando `docker run` para início rápido, homelab e atualizações a partir da 1.x. É um caminho de conveniência, não uma implantação de produção: em produção, execute a stack Compose de 3 contêineres com PostgreSQL e Redis separados. O modo embutido exige executar o contêiner como root e é incompatível com runtimes de UID arbitrário (OpenShift, Kubernetes `runAsNonRoot`); use Compose nesses casos.

| Variável | Padrão | Descrição |
|---|---|---|
| `EMBEDDED` | `auto` | Ativado automaticamente quando `DATABASE_URL` e `REDIS_URL` não estão definidos. Defina como `0` para desativá-lo (o app então falha imediatamente se nenhum `DATABASE_URL`/`REDIS_URL` externo estiver definido, em vez de iniciar silenciosamente um banco de dados dentro do contêiner). |
| `REDIS_MAXMEMORY` | `512mb` | Limite de memória do Redis embutido (somente no modo embutido). Reduza em hosts com pouca memória, como um Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Porta de loopback do PostgreSQL embutido (somente no modo embutido). Altere-a apenas quando o contêiner compartilhar uma rede em que a 5432 já esteja em uso, como `--network host`. Ela deve ser diferente de `EMBEDDED_REDIS_PORT` e maior que 1023, porque o PostgreSQL roda como um usuário sem privilégios, que não pode se vincular a uma porta privilegiada na rede do host. |
| `EMBEDDED_REDIS_PORT` | `6379` | O mesmo, para o Redis embutido, que também roda como um usuário sem privilégios. |
| `EMBEDDED_DB_PASSWORDS` | (vazio) | Defina como `1` para gerar, no próximo boot, senhas aleatórias para os papéis do PostgreSQL embutido e para o Redis, guardadas em `/data/.embedded-db-secrets`. A partir daí, logins via TCP precisam delas. Em um volume criado pela primeira vez pela 2.3.0 ou posterior, o superusuário do PostgreSQL não consegue fazer login via TCP de forma alguma; em um volume mais antigo, o dono do banco de dados é o superusuário, e é a senha dele que o protege. Use-a sempre que outros programas compartilharem a rede do contêiner, como com `--network host`. Ela permanece ativa para esse volume: as senhas são usadas em todo boot mesmo que você remova esta variável, e excluir `/data/.embedded-db-secrets` só gera senhas novas ou, se a variável não estiver definida, um boot que falha. Se o contêiner não iniciar porque um desses arquivos está danificado, exclua esse arquivo com `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` e inicie o contêiner novamente; o próximo boot cria um novo. A variável aceita `1`, `0` ou vazio, e qualquer outro valor interrompe o boot. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Segundos que a inicialização espera o Redis embutido responder a `PING` antes de desistir. Ao estourar o tempo, o contêiner para e registra o motivo, em vez de travar. Segundos inteiros de 1 a 999999; não há valor ilimitado, porque esperar para sempre é exatamente a falha que este limite existe para evitar. Aumente apenas se um host lento o atingir. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | O mesmo, para o PostgreSQL embutido. O relógio começa depois que o `initdb` do primeiro boot termina, então cobre a inicialização do servidor e a recuperação de falhas, e não a criação inicial do banco de dados. |

Atualizando da 1.x: coloque seu `snapotter.db` antigo em `/data/snapotter.db` no volume e o modo embutido o importa para o PostgreSQL embutido no primeiro boot. A importação roda uma vez; os boots seguintes a ignoram.

Nota sobre telemetria: o modo embutido herda o padrão de análises da imagem como qualquer outra configuração. A imagem publicada pode enviar análises, mas uma nova instância pergunta primeiro ao administrador e não envia nada até receber uma resposta. Para desativá-las, responda não, compile com `--build-arg SNAPOTTER_ANALYTICS=off`, defina `SNAPOTTER_ANALYTICS_DEFAULT=off` antes do primeiro boot ou use a desativação pelo administrador no app.

### Limites de processamento {#processing-limits}

| Variável | Padrão | Descrição |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (ilimitado) | Tamanho máximo de arquivo por upload, em megabytes. Defina como 0 para ilimitado. A imagem publicada vem com `0`; uma compilação a partir do código-fonte começa em 100. |
| `MAX_BATCH_SIZE` | `0` (ilimitado) | Número máximo de arquivos em uma única requisição em lote. Defina como 0 para ilimitado. A imagem publicada vem com `0`; uma compilação a partir do código-fonte começa em 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Número de jobs em lote executados em paralelo. Defina como 0 para detectar automaticamente com base nos núcleos de CPU disponíveis. |
| `MAX_MEGAPIXELS` | `0` (ilimitado) | Resolução máxima de imagem permitida, em megapixels. Defina como 0 para ilimitado. |
| `MAX_WORKER_THREADS` | `0` (auto) | Máximo de threads de trabalho para processamento de imagens. Defina como 0 para detectar automaticamente com base nos núcleos de CPU disponíveis. |
| `PROCESSING_TIMEOUT_S` | `0` (sem limite) | Tempo limite de cada chamada ao sidecar Python que executa as ferramentas de IA, em segundos. Defina como 0 para não ter tempo limite. Não limita jobs de imagem, PDF ou mídia; isso é feito por `JOB_TIMEOUT_FAST_S` e `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Segundos que o sidecar Python de IA e o runtime do OCR preciso ficam ociosos antes de encerrar e liberar a memória (cerca de 1,3 GB e 0,7 GB depois de aquecidos). Ambos iniciam novamente na próxima requisição, então a primeira chamada de IA após um encerramento por ociosidade paga o custo de inicialização das bibliotecas, alguns segundos. Defina como 0 para mantê-los em execução. O padrão é igual a `AI_SESSION_IDLE_TIMEOUT`, para que os modelos carregados não sejam descartados antes do que essa configuração determina. Se você aumentar `AI_SESSION_IDLE_TIMEOUT`, aumente este valor para corresponder. |
| `JOB_TIMEOUT_FAST_S` | `120` | Prazo para um job nos pools rápidos (ferramentas de imagem e de documentos), em segundos. Um job que demora mais falha com um erro de tempo limite. Defina como 0 para não ter limite. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Prazo para um job nos pools longos (ferramentas de IA e de mídia, além de qualquer ferramenta marcada como de longa duração), em segundos. Defina como 0 para não ter limite. O OCR de PDF nos modos Balanced e Best estende o próprio prazo de acordo com o número de páginas (2 e 5 minutos por página), até 6 horas, então um PDF grande não exige aumentar este valor. |
| `SYNC_WAIT_MS` | `8000` | Quanto tempo uma requisição de ferramenta espera pelo seu job antes que a API pare de esperar e retorne `202` com um ID de job para acompanhar via SSE, em milissegundos. Isso não interrompe o job. Defina como 0 para esperar pelo job o tempo que for necessário. |
| `MAX_PIPELINE_STEPS` | `20` | Número máximo de etapas em um pipeline. Defina como 0 para não ter limite. |
| `MAX_CANVAS_PIXELS` | `0` (sem limite) | Tamanho máximo do canvas em pixels para imagens de saída. Defina como 0 para não ter limite. |
| `MAX_SVG_SIZE_MB` | `50` | Maior SVG aceito antes da sanitização, em megabytes. `0` se comporta de forma diferente aqui do que nas linhas ao redor. Ele remove por completo o limite de tamanho anterior à análise, em vez de elevá-lo, então deixe este definido. |
| `MAX_PDF_PAGES` | `0` (ilimitado) | Número máximo de páginas de PDF para a conversão de PDF em imagem. Defina como 0 para ilimitado. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Maior campo `settings` que uma requisição de ferramenta pode conter, em kilobytes, contados em bytes UTF-8. Requisições acima do limite recebem `400`. Defina como 0 para não ter limite. As configurações reais das ferramentas são bem menores que 64 KB, então aumente este valor apenas se um cliente enviar configurações excepcionalmente grandes. |

### Engines {#engines}

O SnapOtter procura cada binário de processamento em `$PATH` dentro do contêiner, então estas variáveis ficam vazias a menos que você monte uma compilação própria.

| Variável | Padrão | Descrição |
|---|---|---|
| `FFMPEG_PATH` | (vazio) | Caminho do binário `ffmpeg` por trás das ferramentas de vídeo e áudio. |
| `FFPROBE_PATH` | (vazio) | Caminho de `ffprobe`, que lê arquivos de mídia antes de serem processados. Aponte para a mesma compilação de `FFMPEG_PATH`. |
| `QPDF_PATH` | (vazio) | Caminho de `qpdf`, usado pelas ferramentas de PDF e para verificar PDFs enviados. |
| `SOFFICE_PATH` | (vazio) | Caminho do `soffice` do LibreOffice, usado nas conversões de documentos de escritório. |
| `PDFCPU_PATH` | (vazio) | Caminho de `pdfcpu`, usado por algumas ferramentas de PDF. |
| `GS_PATH` | (vazio) | Caminho do `gs` do Ghostscript, usado pelas ferramentas de PDF e pelo OCR de PDF. |
| `PANDOC_PATH` | (vazio) | Caminho de `pandoc`, usado nas conversões de documentos. |
| `SNAPOTTER_FONT_FILE` | (vazio) | Arquivo de fonte para textos desenhados sobre vídeo (gravar legendas, marca-d'água em vídeo). Vazio usa a primeira fonte que a imagem encontrar. |
| `SNAPOTTER_FONT_FAMILY` | (vazio) | Nome da família de `SNAPOTTER_FONT_FILE`. Vazio significa `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (vazio) | Família de codificadores de vídeo por hardware, `nvenc` ou `vaapi`. Vazio codifica por software. |

`SNAPOTTER_HW_ACCEL` exige um ffmpeg compilado com essa família de codificadores, e o ffmpeg da imagem não tem nenhuma das duas. Com o binário da própria imagem, a configuração recorre à codificação por software e avisa isso no log de inicialização. Para usá-la, monte sua própria compilação do ffmpeg, aponte `FFMPEG_PATH` e `FFPROBE_PATH` para ela e dê ao contêiner o dispositivo de GPU. Para `nvenc`, defina também `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: a imagem pede apenas `compute,utility`, e sem `video` o runtime da NVIDIA não monta a biblioteca de codificação, então o codificador aparece na lista mas toda codificação falha. Um caminho de substituição que não existe ou não é executável também é citado no log de inicialização, e todo job que precisa desse binário falha até você corrigir o caminho ou removê-lo.

Os arquivos Compose publicados repassam todas elas a partir de `.env`, então defini-las lá é suficiente.

### Limpeza {#cleanup}

| Variável | Padrão | Descrição |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Por quanto tempo os resultados de processamento não salvos (uploads brutos e saídas de ferramentas) são mantidos antes da exclusão automática. Os arquivos que você salva explicitamente na biblioteca de Arquivos não são afetados e persistem até você excluí-los. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Com que frequência o job de limpeza é executado. |

### Aparência {#appearance}

| Variável | Padrão | Descrição |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema padrão para novas sessões. `light`, `dark` ou `system`. |
| `DEFAULT_LOCALE` | `en` | Idioma padrão da interface. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Layout padrão das ferramentas. `sidebar` ou `fullscreen`. |

### Permissões do Docker {#docker-permissions}

| Variável | Padrão | Descrição |
|---|---|---|
| `PUID` | `999` | Executa o processo do contêiner com este UID. Defina de acordo com o usuário do host para bind mounts (`id -u`). |
| `PGID` | `999` | Executa o processo do contêiner com este GID. Defina de acordo com o grupo do host para bind mounts (`id -g`). |

## Exemplo com Docker {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumes {#volumes}

A stack Docker Compose usa quatro volumes:

- `/data` (app) - Modelos de IA, venv do Python e arquivos do usuário. Monte-o para manter os arquivos enviados e os bundles de IA instalados entre reinicializações.
- `/tmp/workspace` (app) - Armazenamento temporário dos arquivos em processamento. Pode ser efêmero, mas montá-lo evita encher a camada gravável do contêiner.
- `SnapOtter-pgdata` (postgres) - Diretório de dados do PostgreSQL. Guarda todos os dados relacionais (usuários, configurações, pipelines, jobs, log de auditoria). Faça backup por meio de `pg_dump` ou de um snapshot do volume.
- `SnapOtter-redisdata` (redis) - Arquivo append-only do Redis para filas de jobs duráveis.
