---
description: "Esquema do banco de dados PostgreSQL, tabelas, migrações e procedimentos de backup do SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 532bf68bb799
i18n_hash_version: 2
---

# Banco de dados {#database}

O SnapOtter usa PostgreSQL 17 com [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) para persistência de dados. O esquema é definido em `apps/api/src/db/schema.ts`.

A conexão é configurada pela variável de ambiente `DATABASE_URL` (padrão `postgres://snapotter:snapotter@postgres:5432/snapotter`). No Docker Compose, o contêiner do Postgres armazena seus dados no volume nomeado `SnapOtter-pgdata`. As requisições são atendidas por uma função que só pode ler e gravar linhas, descrita em [Funções com privilégio mínimo](#least-privilege-roles) mais adiante.

## Tabelas {#tables}

### users {#users}

Armazena contas de usuário. Criada automaticamente na primeira execução a partir de `DEFAULT_USERNAME` e `DEFAULT_PASSWORD`.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `username` | varchar | Único, obrigatório |
| `passwordHash` | varchar | Hash scrypt |
| `role` | varchar | `admin`, `editor` ou `user` |
| `mustChangePassword` | boolean | Indicador de redefinição de senha obrigatória |
| `createdAt` | timestamp | Data de criação |
| `updatedAt` | timestamp | Data da última atualização |

### sessions {#sessions}

Sessões de login ativas. Cada linha associa um token de sessão a um usuário.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | varchar | Chave primária (token de sessão) |
| `userId` | uuid | Chave estrangeira para `users.id` |
| `expiresAt` | timestamp | Data de expiração |
| `createdAt` | timestamp | Data de criação |

### teams {#teams}

Grupos para organizar usuários. Administradores podem atribuir usuários a equipes.

| Coluna | Tipo | Descrição |
|--------|------|-------------|
| `id` | uuid | Chave primária |
| `name` | varchar (único, máx. 50 caracteres) | Nome da equipe |
| `createdAt` | timestamp | Data de criação |

### api_keys {#api-keys}

Chaves de API para acesso programático. A chave bruta é exibida uma única vez na criação; apenas o hash é armazenado.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `userId` | uuid | Chave estrangeira para `users.id` |
| `keyHash` | varchar | Hash scrypt da chave |
| `name` | varchar | Rótulo informado pelo usuário |
| `createdAt` | timestamp | Data de criação |
| `lastUsedAt` | timestamp | Atualizado a cada requisição autenticada |

As chaves têm o prefixo `si_` seguido de 96 caracteres hexadecimais (48 bytes aleatórios).

### pipelines {#pipelines}

Cadeias de ferramentas salvas que os usuários criam na interface.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `name` | varchar | Nome do pipeline |
| `description` | varchar | Descrição opcional |
| `steps` | jsonb | Array de objetos `{ toolId, settings }` |
| `createdAt` | timestamp | Data de criação |

### user_files {#user-files}

Biblioteca de arquivos persistente. Uma edição salva é inserida por padrão como uma linha raiz independente ("salvar como novo": `version` 1, `parentId` nulo, de modo que o original continua listado), ou como uma versão vinculada ao pai quando você sobrescreve o original (`parentId` definido, `version` incrementado, substituindo-o). A coluna `toolChain` registra as ferramentas aplicadas.

| Coluna | Tipo | Descrição |
|--------|------|-------------|
| `id` | uuid | Chave primária |
| `userId` | uuid | FK para users (CASCADE DELETE) |
| `originalName` | varchar | Nome do arquivo original enviado |
| `storedName` | varchar | Nome do arquivo em disco |
| `mimeType` | varchar | Tipo MIME |
| `size` | integer | Tamanho do arquivo em bytes |
| `width` | integer | Largura da imagem em px |
| `height` | integer | Altura da imagem em px |
| `version` | integer | Número da versão (1 = original) |
| `parentId` | uuid ou nulo | FK para user_files (versão pai) |
| `toolChain` | jsonb | IDs das ferramentas aplicadas em ordem para produzir esta versão |
| `createdAt` | timestamp | Data de criação |

### jobs {#jobs}

Acompanha os jobs de processamento para exibir o progresso e fazer a limpeza.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `type` | varchar | Identificador da ferramenta ou do pipeline |
| `status` | varchar | `queued`, `processing`, `completed` ou `failed` |
| `progress` | real | Fração de 0.0 a 1.0 |
| `inputFiles` | jsonb | Array de caminhos dos arquivos de entrada |
| `outputPath` | varchar | Caminho do arquivo de resultado |
| `settings` | jsonb | Configurações da ferramenta utilizadas |
| `error` | varchar | Mensagem de erro, em caso de falha |
| `createdAt` | timestamp | Data de criação |
| `completedAt` | timestamp | Data de conclusão |

### settings {#settings}

Armazenamento chave-valor para configurações de todo o servidor que os administradores podem alterar pela interface.

| Coluna | Tipo | Observações |
|---|---|---|
| `key` | varchar | Chave primária |
| `value` | varchar | Valor da configuração |
| `updatedAt` | timestamp | Data da última atualização |

### roles {#roles}

Funções personalizadas com permissões granulares.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `name` | varchar | Nome único da função |
| `description` | varchar | Descrição opcional |
| `permissions` | jsonb | Array de strings de permissão |
| `createdAt` | timestamp | Data de criação |

### audit_log {#audit-log}

Log de ações relevantes para a segurança.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | uuid | Chave primária |
| `userId` | uuid | FK para users |
| `action` | varchar | Tipo da ação |
| `details` | jsonb | Dados específicos da ação |
| `createdAt` | timestamp | Momento da ação |

### user_preferences {#user-preferences}

Estado da interface por usuário, indexado pelo nome da preferência. Sustenta as ferramentas fixadas do painel por meio de `PUT /api/v1/preferences`.

| Coluna | Tipo | Observações |
|---|---|---|
| `userId` | text | FK para users, com exclusão em cascata. Chave primária junto com `key` |
| `key` | text | Nome da preferência. Chave primária junto com `userId` |
| `value` | jsonb | Conteúdo da preferência |
| `updatedAt` | timestamp | Última gravação |

## Migrações {#migrations}

O Drizzle cuida das migrações do esquema. Os arquivos de migração ficam em `apps/api/drizzle/`. Durante o desenvolvimento:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Em produção, as migrações pendentes são aplicadas automaticamente na inicialização.

## Funções com privilégio mínimo {#least-privilege-roles}

Duas funções, dois trabalhos. `DATABASE_URL` atende as requisições e detém `SELECT`, `INSERT`, `UPDATE`, `DELETE` nas tabelas do app, além de `USAGE` e `SELECT` nas respectivas sequences. Essa é a lista inteira. Ela não pode criar nem remover uma tabela, instalar uma extensão, `TRUNCATE`, ler `pg_authid`, criar um banco de dados, alterar uma função nem tocar no esquema `drizzle`, onde fica o histórico de migrações.

`DATABASE_MIGRATION_URL` é a função privilegiada. Ela executa as migrações e concede permissões à função de execução durante a inicialização, e então fecha antes de uma única requisição ser atendida.

A divisão chega no SnapOtter 2.3.0. A partir dessa versão, os arquivos Compose do repositório e a imagem all-in-one são configurados assim, inclusive nas instalações existentes: na inicialização, o SnapOtter cria a função de execução se ela não existir, concede as permissões, executa as migrações e depois aplica as permissões também às tabelas que já existiam. A atualização não exige SQL manual.

A imagem 2.2.0 lê apenas a string de conexão de execução e nunca cria a segunda função, então, se você a configurar com a divisão, ela nunca sobe: o log do app mostra a falha de autenticação por senha para essa função, e o log do Postgres informa que a função não existe. Atualize a imagem para a 2.3.0 ou posterior antes de trocar um arquivo Compose para a divisão.

Deixar `DATABASE_MIGRATION_URL` vazio executa com uma única função, com `DATABASE_URL` fazendo as duas tarefas exatamente como antes da divisão. Essa é uma configuração suportada, não obsoleta. É a resposta certa em Postgres gerenciado, onde criar funções muitas vezes não é algo que você possa fazer.

### Postgres externo e gerenciado {#external-and-managed-postgres}

No RDS, Supabase, Cloud SQL ou qualquer cluster que você mesmo opere, a divisão é opcional. Crie a função de execução uma vez:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Depois, forneça ao SnapOtter as duas strings de conexão, apontando para o mesmo host, porta e banco de dados:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Pare por aí. O SnapOtter aplica as permissões por conta própria e as reaplica após cada migração, então uma tabela adicionada por uma versão futura é coberta sem que ninguém precise executar SQL para isso.

A função em `DATABASE_MIGRATION_URL` precisa ser a dona das tabelas do SnapOtter, porque apenas o dono de uma tabela pode conceder permissões sobre ela. Em uma instalação existente, isso significa a função com a qual você vem executando o SnapOtter, não uma nova criada para esse fim. Aponte para uma função nova que não possui nada e a inicialização falha com um erro dizendo exatamente isso. Ela também precisa de `CREATEROLE` para criar e manter a função de execução, e do direito de criar o esquema `drizzle`.

Informe a mesma função nas duas URLs e a divisão fica desativada, e o SnapOtter avisa isso no log em vez de fingir o contrário. Se o seu provedor não oferece nenhuma função que possa ao mesmo tempo ser dona das tabelas e deter `CREATEROLE`, execute com uma única função.

### Por que o bit de superusuário é mantido {#why-the-superuser-bit-is-left-alone}

O SnapOtter nunca remove `SUPERUSER` de uma função por conta própria. Em uma instalação criada antes da divisão, `snapotter` é o único superusuário do cluster, e rebaixá-lo deixaria o cluster sem nenhum, recuperável apenas pelo modo de usuário único com o servidor parado. O que dá a proteção é mover a conexão de longa duração para a função restrita. O superusuário fica na conexão por alguns segundos durante a inicialização e depois desaparece.

Instalações all-in-one novas nunca têm esse problema. Elas recebem três funções: `postgres` (superusuário de bootstrap, ausente de toda string de conexão que o SnapOtter usa), `snapotter` (`NOSUPERUSER`, dono dos dados, conecta apenas na inicialização) e `snapotter_app` (apenas linhas, atende as requisições).

Para rebaixar mesmo assim um `snapotter` mais antigo, crie primeiro um segundo superusuário e entre com ele para confirmar que funciona. Depois, `ALTER ROLE snapotter NOSUPERUSER`.

## Backup e restauração {#backup-and-restore}

O banco de dados relacional fica no volume `SnapOtter-pgdata` do contêiner do Postgres, não no volume `/data` do app.

**Backup lógico com validação (recomendado)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Os dois comandos conectam como `snapotter`, o dono, e devem continuar assim. A função de execução não enxerga o esquema `drizzle`, então um dump feito com ela sairia incompleto. `--no-owner` deixa os objetos restaurados pertencendo a quem executa a restauração, então executá-la como dono coloca a propriedade onde as permissões esperam. Um detalhe em um cluster novo: `pg_dump` carrega as permissões, mas não as funções que elas citam, então crie `snapotter_app` antes de restaurar, ou `--exit-on-error` para no primeiro `GRANT`. O SnapOtter reaplica as permissões na próxima inicialização de qualquer forma.

Este dump do banco de dados não contém os objetos da biblioteca salvos em `/data/files` nem o estado durável do BullMQ no Redis. Faça backup e restauração desses itens com o procedimento coordenado em [Segurança e Hardening](/pt-BR/guide/security#backup-and-recovery).

**Snapshot de volume a frio**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Não copie um diretório de dados do PostgreSQL em execução com `tar`. O Compose prefixa os nomes dos volumes com o projeto, então resolva os IDs dos volumes montados a partir de `docker inspect` ou da sua plataforma de armazenamento, em vez de presumir o rótulo literal `SnapOtter-pgdata`.

### Migrando da 1.x (SQLite) {#migrating-from-1-x-sqlite}

A atualização a partir do SnapOtter 1.x tem um guia próprio: veja [Atualizando da 1.x para a 2.0](./upgrading). Em resumo, reutilize seu volume `/data` existente e a 2.0 detecta e importa `/data/snapotter.db` automaticamente no primeiro boot (ou defina `SQLITE_MIGRATE_PATH` para apontar para ele explicitamente). Faça backup de todo o volume `/data` primeiro, não apenas de `snapotter.db`: a 1.x usa o modo WAL do SQLite, então um contêiner parado costuma deixar a maior parte dos dados em `snapotter.db-wal`, ao lado de um `snapotter.db` quase vazio.
