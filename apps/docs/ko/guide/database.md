---
description: "SnapOtter의 PostgreSQL 데이터베이스 스키마, 테이블, 마이그레이션, 백업 절차를 설명합니다."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 51ea83d245c6
i18n_hash_version: 2
---

# 데이터베이스 {#database}

SnapOtter는 데이터 영속성을 위해 PostgreSQL 17과 [Drizzle ORM](https://orm.drizzle.team/)(pg-core / node-postgres)을 사용합니다. 스키마는 `apps/api/src/db/schema.ts`에 정의되어 있습니다.

연결은 `DATABASE_URL` 환경 변수로 설정합니다(기본값 `postgres://snapotter:snapotter@postgres:5432/snapotter`). Docker Compose에서는 Postgres 컨테이너가 데이터를 `SnapOtter-pgdata` 이름 있는 볼륨에 저장합니다. 요청은 행을 읽고 쓰기만 할 수 있는 역할로 처리되며, 이 내용은 아래의 [최소 권한 역할](#least-privilege-roles)에서 다룹니다.

## 테이블 {#tables}

### users {#users}

사용자 계정을 저장합니다. 최초 실행 시 `DEFAULT_USERNAME`와 `DEFAULT_PASSWORD`에서 자동으로 생성됩니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `username` | varchar | 고유, 필수 |
| `passwordHash` | varchar | scrypt 해시 |
| `role` | varchar | `admin`, `editor`, 또는 `user` |
| `mustChangePassword` | boolean | 비밀번호 강제 재설정 플래그 |
| `createdAt` | timestamp | 생성 시각 |
| `updatedAt` | timestamp | 마지막 수정 시각 |

### sessions {#sessions}

활성 로그인 세션입니다. 각 행은 세션 토큰을 사용자와 연결합니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `id` | varchar | 기본 키(세션 토큰) |
| `userId` | uuid | `users.id`에 대한 외래 키 |
| `expiresAt` | timestamp | 만료 시각 |
| `createdAt` | timestamp | 생성 시각 |

### teams {#teams}

사용자를 묶어 관리하는 그룹입니다. 관리자는 사용자를 팀에 할당할 수 있습니다.

| 컬럼 | 타입 | 설명 |
|--------|------|-------------|
| `id` | uuid | 기본 키 |
| `name` | varchar (고유, 최대 50자) | 팀 이름 |
| `createdAt` | timestamp | 생성 시각 |

### api_keys {#api-keys}

프로그래밍 방식 접근을 위한 API 키입니다. 원본 키는 생성할 때 한 번만 표시되며, 해시만 저장됩니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `userId` | uuid | `users.id`에 대한 외래 키 |
| `keyHash` | varchar | 키의 scrypt 해시 |
| `name` | varchar | 사용자가 지정한 레이블 |
| `createdAt` | timestamp | 생성 시각 |
| `lastUsedAt` | timestamp | 인증된 요청마다 갱신 |

키는 접두사 `si_` 뒤에 16진수 96자(임의 바이트 48개)가 붙은 형태입니다.

### pipelines {#pipelines}

사용자가 UI에서 만든 저장된 도구 체인입니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `name` | varchar | 파이프라인 이름 |
| `description` | varchar | 선택 사항인 설명 |
| `steps` | jsonb | `{ toolId, settings }` 객체의 배열 |
| `createdAt` | timestamp | 생성 시각 |

### user_files {#user-files}

영구 파일 라이브러리입니다. 저장된 편집본은 기본적으로 독립된 루트 행으로 삽입되거나("새로 저장": `version` 1, `parentId` null이며 원본도 계속 목록에 남음), 원본을 덮어쓰는 경우에는 부모에 연결된 버전으로 삽입됩니다(`parentId` 설정, `version` 증가, 원본을 대체). `toolChain` 컬럼에는 적용된 도구가 기록됩니다.

| 컬럼 | 타입 | 설명 |
|--------|------|-------------|
| `id` | uuid | 기본 키 |
| `userId` | uuid | users에 대한 FK (CASCADE DELETE) |
| `originalName` | varchar | 업로드한 원본 파일 이름 |
| `storedName` | varchar | 디스크상의 파일 이름 |
| `mimeType` | varchar | MIME 타입 |
| `size` | integer | 파일 크기(바이트) |
| `width` | integer | 이미지 너비(px) |
| `height` | integer | 이미지 높이(px) |
| `version` | integer | 버전 번호(1 = 원본) |
| `parentId` | uuid 또는 null | user_files에 대한 FK(부모 버전) |
| `toolChain` | jsonb | 이 버전을 만들기 위해 순서대로 적용한 도구 ID |
| `createdAt` | timestamp | 생성 시각 |

### jobs {#jobs}

진행 상황 보고와 정리를 위해 처리 작업을 추적합니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `type` | varchar | 도구 또는 파이프라인 식별자 |
| `status` | varchar | `queued`, `processing`, `completed`, 또는 `failed` |
| `progress` | real | 0.0-1.0 비율 |
| `inputFiles` | jsonb | 입력 파일 경로의 배열 |
| `outputPath` | varchar | 결과 파일 경로 |
| `settings` | jsonb | 사용한 도구 설정 |
| `error` | varchar | 실패한 경우의 오류 메시지 |
| `createdAt` | timestamp | 생성 시각 |
| `completedAt` | timestamp | 완료 시각 |

### settings {#settings}

관리자가 UI에서 변경할 수 있는 서버 전체 설정의 키-값 저장소입니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `key` | varchar | 기본 키 |
| `value` | varchar | 설정 값 |
| `updatedAt` | timestamp | 마지막 수정 시각 |

### roles {#roles}

세분화된 권한을 가진 사용자 지정 역할입니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `name` | varchar | 고유한 역할 이름 |
| `description` | varchar | 선택 사항인 설명 |
| `permissions` | jsonb | 권한 문자열의 배열 |
| `createdAt` | timestamp | 생성 시각 |

### audit_log {#audit-log}

보안과 관련된 동작의 로그입니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `userId` | uuid | users에 대한 FK |
| `action` | varchar | 동작 유형 |
| `details` | jsonb | 동작별 데이터 |
| `createdAt` | timestamp | 동작 시각 |

### user_preferences {#user-preferences}

환경설정 이름을 키로 하는 사용자별 UI 상태입니다. `PUT /api/v1/preferences`를 통해 대시보드의 고정된 도구를 뒷받침합니다.

| 컬럼 | 타입 | 참고 |
|---|---|---|
| `userId` | text | users에 대한 FK이며 삭제 시 연쇄 삭제됩니다. `key`와 함께 기본 키 |
| `key` | text | 환경설정 이름. `userId`와 함께 기본 키 |
| `value` | jsonb | 환경설정 페이로드 |
| `updatedAt` | timestamp | 마지막 쓰기 |

## 마이그레이션 {#migrations}

스키마 마이그레이션은 Drizzle이 처리합니다. 마이그레이션 파일은 `apps/api/drizzle/`에 있습니다. 개발 중에는 다음과 같이 합니다.

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

프로덕션에서는 대기 중인 마이그레이션이 시작할 때 자동으로 적용됩니다.

## 최소 권한 역할 {#least-privilege-roles}

역할 두 개가 각자 하나의 일을 맡습니다. `DATABASE_URL`는 요청을 처리하며, 앱 테이블에 대한 `SELECT`, `INSERT`, `UPDATE`, `DELETE` 권한과 해당 시퀀스에 대한 `USAGE` 및 `SELECT` 권한을 가집니다. 권한은 이것이 전부입니다. 테이블을 만들거나 삭제할 수 없고, 확장을 설치할 수 없으며, `TRUNCATE`을 실행할 수 없고, `pg_authid`을 읽을 수 없으며, 데이터베이스를 만들 수 없고, 역할을 변경할 수 없으며, 마이그레이션 기록이 있는 `drizzle` 스키마에 접근할 수도 없습니다.

`DATABASE_MIGRATION_URL`는 권한이 높은 쪽입니다. 부팅 중에 마이그레이션을 실행하고 런타임 역할에 권한을 부여한 뒤, 첫 요청을 처리하기 전에 닫힙니다.

이 분리는 SnapOtter 2.3.0에서 제공됩니다. 이 릴리스부터 저장소 내 Compose 파일과 올인원 이미지는 기존 설치를 포함해 이 방식으로 구성됩니다. 부팅할 때 SnapOtter는 런타임 역할이 없으면 만들고, 권한을 부여하고, 마이그레이션한 다음, 이전부터 있던 테이블에도 권한을 일괄 적용합니다. 업그레이드에 수동 SQL은 필요하지 않습니다.

2.2.0 이미지는 런타임 연결 문자열만 읽고 두 번째 역할을 만들지 않습니다. 따라서 분리된 구성을 넘기면 시작되지 않습니다. 앱 로그에는 해당 역할의 비밀번호 인증이 실패한다고 표시되고, Postgres 로그에는 역할이 존재하지 않는다고 표시됩니다. Compose 파일을 분리된 구성으로 바꾸기 전에 이미지를 2.3.0 이상으로 업그레이드하세요.

`DATABASE_MIGRATION_URL`를 비워 두면 단일 역할로 실행되며, `DATABASE_URL`이 분리 이전과 똑같이 두 가지 일을 모두 맡습니다. 이는 지원되는 구성이며 지원 중단 예정이 아닙니다. 역할을 만드는 일이 내 권한 밖인 경우가 많은 관리형 Postgres에서는 이 방식이 맞습니다.

### 외부 및 관리형 Postgres {#external-and-managed-postgres}

RDS, Supabase, Cloud SQL, 또는 직접 운영하는 모든 클러스터에서는 이 분리가 선택 사항입니다. 먼저 런타임 역할을 한 번 만드세요.

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

그런 다음 같은 호스트, 포트, 데이터베이스를 가리키는 두 연결 문자열을 SnapOtter에 모두 전달합니다.

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

여기까지만 하면 됩니다. SnapOtter가 권한을 직접 부여하고 마이그레이션이 끝날 때마다 다시 적용하므로, 이후 릴리스에서 추가되는 테이블도 따로 SQL을 실행하지 않아도 포함됩니다.

`DATABASE_MIGRATION_URL`의 역할은 SnapOtter 테이블을 소유해야 합니다. 테이블의 소유자만 그 테이블에 권한을 부여할 수 있기 때문입니다. 기존 설치에서는 이 목적으로 새로 만든 역할이 아니라 지금까지 SnapOtter를 실행해 온 역할을 뜻합니다. 아무것도 소유하지 않은 새 역할을 지정하면 부팅이 실패하고, 바로 이 점을 알려 주는 오류가 표시됩니다. 또한 런타임 역할을 만들고 유지하려면 `CREATEROLE`가 필요하며, `drizzle` 스키마를 만들 수 있는 권한도 필요합니다.

두 URL에 같은 역할을 쓰면 분리가 꺼지며, SnapOtter는 그렇지 않은 척하지 않고 로그에 그 사실을 남깁니다. 사용 중인 제공업체가 테이블을 소유하면서 동시에 `CREATEROLE`를 가질 수 있는 역할을 주지 않는다면 단일 역할로 실행하세요.

### 슈퍼유저 비트를 건드리지 않는 이유 {#why-the-superuser-bit-is-left-alone}

SnapOtter는 역할에서 `SUPERUSER`을 스스로 제거하지 않습니다. 분리 이전에 만든 설치에서는 `snapotter`가 클러스터의 유일한 슈퍼유저이므로, 권한을 낮추면 클러스터에 슈퍼유저가 하나도 남지 않게 되고, 서버를 중지한 상태에서 단일 사용자 모드로만 복구할 수 있습니다. 보호는 오래 유지되는 연결을 제한된 역할로 옮기는 것으로 얻습니다. 슈퍼유저는 부팅하는 몇 초 동안만 연결에 쓰이고 그 뒤에는 사라집니다.

새로 설치한 올인원에는 이런 문제가 없습니다. 역할이 세 개 만들어집니다: `postgres`(부트스트랩 슈퍼유저이며 SnapOtter가 사용하는 어떤 연결 문자열에도 나타나지 않음), `snapotter`(`NOSUPERUSER`, 데이터를 소유하고 부팅할 때만 연결), `snapotter_app`(행 접근만 가능, 요청 처리).

그래도 이전 `snapotter`의 권한을 낮추려면 먼저 두 번째 슈퍼유저를 만들고 그 계정으로 로그인해 동작하는지 확인하세요. 그런 다음 `ALTER ROLE snapotter NOSUPERUSER`.

## 백업 및 복원 {#backup-and-restore}

관계형 데이터베이스는 앱의 `/data` 볼륨이 아니라 Postgres 컨테이너의 `SnapOtter-pgdata` 볼륨에 있습니다.

**검증을 포함한 논리 백업(권장)**

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

두 명령 모두 소유자인 `snapotter`로 연결하며, 계속 그렇게 해야 합니다. 런타임 역할은 `drizzle` 스키마를 볼 수 없으므로, 그 역할로 받은 덤프는 불완전하게 나옵니다. `--no-owner`는 복원된 객체를 복원을 실행한 사용자의 소유로 두므로, 소유자로 실행하면 권한이 기대하는 곳에 소유권이 놓입니다. 새 클러스터에서 한 가지 주의할 점이 있습니다. `pg_dump`에는 권한은 들어 있지만 그 권한이 가리키는 역할은 들어 있지 않으므로, 복원하기 전에 `snapotter_app`를 만들어 두지 않으면 `--exit-on-error`가 첫 `GRANT`에서 멈춥니다. 어느 경우든 SnapOtter는 다음 부팅 때 권한을 다시 적용합니다.

이 데이터베이스 덤프에는 `/data/files`에 있는 저장된 라이브러리 객체나 Redis의 내구성 있는 BullMQ 상태가 들어 있지 않습니다. 이 둘은 [보안 및 강화](/ko/guide/security#backup-and-recovery)의 조정된 절차에 따라 백업하고 복원하세요.

**콜드 볼륨 스냅샷**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

실행 중인 PostgreSQL 데이터 디렉터리를 `tar`로 복사하지 마세요. Compose는 볼륨 이름 앞에 프로젝트 이름을 붙이므로, 레이블 `SnapOtter-pgdata`을 그대로 가정하지 말고 `docker inspect`이나 스토리지 플랫폼에서 마운트된 볼륨 ID를 확인하세요.

### 1.x(SQLite)에서 마이그레이션 {#migrating-from-1-x-sqlite}

SnapOtter 1.x에서 업그레이드하는 방법은 별도 가이드가 있습니다. [1.x에서 2.0으로 업그레이드](./upgrading)를 참고하세요. 요약하면 기존 `/data` 볼륨을 그대로 쓰면 2.0이 첫 부팅 때 `/data/snapotter.db`를 자동으로 감지해 가져옵니다(또는 `SQLITE_MIGRATE_PATH`를 설정해 직접 지정할 수 있습니다). 먼저 `snapotter.db`뿐 아니라 `/data` 볼륨 전체를 백업하세요. 1.x는 SQLite WAL 모드를 사용하므로, 컨테이너를 중지하면 데이터 대부분이 거의 비어 있는 `snapotter.db` 옆의 `snapotter.db-wal`에 남아 있는 경우가 많습니다.
