---
description: "SnapOtter의 PostgreSQL 데이터베이스 스키마, 테이블, 마이그레이션, 백업 절차."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 469f8d270e1f
i18n_hash_version: 2
---

# 데이터베이스 {#database}

SnapOtter는 데이터 영속성을 위해 PostgreSQL 17과 [Drizzle ORM](https://orm.drizzle.team/)(pg-core / node-postgres)을 사용합니다. 스키마는 `apps/api/src/db/schema.ts`에 정의되어 있습니다.

연결은 `DATABASE_URL` 환경 변수로 구성됩니다(기본값 `postgres://snapotter:snapotter@postgres:5432/snapotter`). Docker Compose에서는 Postgres 컨테이너가 데이터를 `SnapOtter-pgdata` 명명된 볼륨에 저장합니다. 요청은 행을 읽고 쓰는 것만 가능한 역할로 처리되며, 자세한 내용은 아래 [최소 권한 역할](#least-privilege-roles)에서 다룹니다.

## 테이블 {#tables}

### users {#users}

사용자 계정을 저장합니다. 첫 실행 시 `DEFAULT_USERNAME`과 `DEFAULT_PASSWORD`에서 자동으로 생성됩니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `username` | varchar | 고유, 필수 |
| `passwordHash` | varchar | scrypt 해시 |
| `role` | varchar | `admin`, `editor`, 또는 `user` |
| `mustChangePassword` | boolean | 비밀번호 강제 재설정 플래그 |
| `createdAt` | timestamp | 생성 시각 |
| `updatedAt` | timestamp | 마지막 업데이트 시각 |

### sessions {#sessions}

활성 로그인 세션. 각 행은 세션 토큰을 사용자와 연결합니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | varchar | 기본 키 (세션 토큰) |
| `userId` | uuid | `users.id`에 대한 외래 키 |
| `expiresAt` | timestamp | 만료 시각 |
| `createdAt` | timestamp | 생성 시각 |

### teams {#teams}

사용자를 조직화하기 위한 그룹. 관리자는 사용자를 팀에 할당할 수 있습니다.

| 컬럼 | 타입 | 설명 |
|--------|------|-------------|
| `id` | uuid | 기본 키 |
| `name` | varchar (고유, 최대 50자) | 팀 이름 |
| `createdAt` | timestamp | 생성 시각 |

### api_keys {#api-keys}

프로그래밍 방식 접근을 위한 API 키. 원본 키는 생성 시 한 번만 표시되며, 해시만 저장됩니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `userId` | uuid | `users.id`에 대한 외래 키 |
| `keyHash` | varchar | 키의 scrypt 해시 |
| `name` | varchar | 사용자가 지정한 레이블 |
| `createdAt` | timestamp | 생성 시각 |
| `lastUsedAt` | timestamp | 인증된 요청마다 업데이트됨 |

키는 `si_` 접두어 뒤에 96개의 16진수 문자(48개의 임의 바이트)가 붙습니다.

### pipelines {#pipelines}

사용자가 UI에서 만드는 저장된 도구 체인.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `name` | varchar | 파이프라인 이름 |
| `description` | varchar | 선택적 설명 |
| `steps` | jsonb | `{ toolId, settings }` 객체의 배열 |
| `createdAt` | timestamp | 생성 시각 |

### user_files {#user-files}

영속 파일 라이브러리. 저장된 편집본은 기본적으로 독립적인 루트 행으로 삽입되거나("새 파일로 저장": `version`은 1, `parentId`는 null이므로 원본이 목록에 그대로 남습니다), 원본을 덮어쓸 때는 부모와 연결된 버전으로 삽입됩니다(`parentId`가 설정되고 `version`이 증가하여 원본을 대체합니다). `toolChain` 컬럼은 적용된 도구를 기록합니다.

| 컬럼 | 타입 | 설명 |
|--------|------|-------------|
| `id` | uuid | 기본 키 |
| `userId` | uuid | users에 대한 FK (CASCADE DELETE) |
| `originalName` | varchar | 원본 업로드 파일명 |
| `storedName` | varchar | 디스크상의 파일명 |
| `mimeType` | varchar | MIME 타입 |
| `size` | integer | 바이트 단위 파일 크기 |
| `width` | integer | 이미지 너비(px) |
| `height` | integer | 이미지 높이(px) |
| `version` | integer | 버전 번호 (1 = 원본) |
| `parentId` | uuid 또는 null | user_files에 대한 FK (부모 버전) |
| `toolChain` | jsonb | 이 버전을 생성하기 위해 순서대로 적용된 도구 ID |
| `createdAt` | timestamp | 생성 시각 |

### jobs {#jobs}

진행 상황 보고와 정리를 위해 처리 작업을 추적합니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `type` | varchar | 도구 또는 파이프라인 식별자 |
| `status` | varchar | `queued`, `processing`, `completed`, 또는 `failed` |
| `progress` | real | 0.0-1.0 비율 |
| `inputFiles` | jsonb | 입력 파일 경로의 배열 |
| `outputPath` | varchar | 결과 파일 경로 |
| `settings` | jsonb | 사용된 도구 설정 |
| `error` | varchar | 실패 시 오류 메시지 |
| `createdAt` | timestamp | 생성 시각 |
| `completedAt` | timestamp | 완료 시각 |

### settings {#settings}

관리자가 UI에서 변경할 수 있는 서버 전역 설정을 위한 키-값 저장소.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `key` | varchar | 기본 키 |
| `value` | varchar | 설정 값 |
| `updatedAt` | timestamp | 마지막 업데이트 시각 |

### roles {#roles}

세분화된 권한을 가진 커스텀 역할.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `name` | varchar | 고유 역할 이름 |
| `description` | varchar | 선택적 설명 |
| `permissions` | jsonb | 권한 문자열의 배열 |
| `createdAt` | timestamp | 생성 시각 |

### audit_log {#audit-log}

보안 관련 작업 로그.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | 기본 키 |
| `userId` | uuid | users에 대한 FK |
| `action` | varchar | 작업 유형 |
| `details` | jsonb | 작업별 데이터 |
| `createdAt` | timestamp | 작업 시각 |

### user_preferences {#user-preferences}

사용자별 UI 상태를 환경설정 이름으로 키를 잡아 저장합니다. 홈페이지에 고정된 도구는 `PUT /api/v1/preferences`를 통해 여기에 기록됩니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `userId` | text | users에 대한 FK, 삭제 시 연쇄 적용. `key`와 함께 기본 키 |
| `key` | text | 환경설정 이름. `userId`와 함께 기본 키 |
| `value` | jsonb | 환경설정 내용 |
| `updatedAt` | timestamp | 마지막 쓰기 시각 |

## 마이그레이션 {#migrations}

Drizzle이 스키마 마이그레이션을 처리합니다. 마이그레이션 파일은 `apps/api/drizzle/`에 있습니다. 개발 중에는:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

프로덕션에서는 시작 시 대기 중인 마이그레이션이 자동으로 적용됩니다.

## 최소 권한 역할 {#least-privilege-roles}

역할은 둘, 맡는 일도 둘입니다. `DATABASE_URL`은 요청을 처리하며 앱 테이블에 대한 `SELECT`, `INSERT`, `UPDATE`, `DELETE` 권한과 해당 시퀀스에 대한 `USAGE` 및 `SELECT` 권한을 가집니다. 목록은 그게 전부입니다. 이 역할은 테이블을 만들거나 삭제할 수 없고, 확장을 설치하거나 `TRUNCATE`를 실행할 수 없으며, `pg_authid`를 읽거나 데이터베이스를 만들거나 역할을 변경할 수 없고, 마이그레이션 이력이 들어 있는 `drizzle` 스키마에도 손댈 수 없습니다.

`DATABASE_MIGRATION_URL`이 권한을 가진 쪽입니다. 부팅 중에 마이그레이션을 실행하고 런타임 역할에 권한을 부여한 뒤, 요청이 하나라도 처리되기 전에 연결을 닫습니다.

Compose와 올인원 이미지는 이미 이렇게 구성되어 있으며, 기존 설치본도 마찬가지입니다. SnapOtter는 부팅 시 런타임 역할이 없으면 만들고, 권한을 부여하고, 마이그레이션한 다음, 이전부터 있던 테이블에도 권한을 적용합니다. 업그레이드에 수동 SQL은 필요하지 않습니다.

`DATABASE_MIGRATION_URL`을 비워 두면 단일 역할로 동작하며, `DATABASE_URL`이 분리 이전과 똑같이 두 가지 일을 모두 처리합니다. 이는 지원되는 구성이며 폐기 예정 방식이 아닙니다. 역할을 만드는 일이 사용자 몫이 아닌 경우가 많은 관리형 Postgres에서는 이 방식이 맞습니다.

### 외부 및 관리형 Postgres {#external-and-managed-postgres}

RDS, Supabase, Cloud SQL, 또는 직접 운영하는 클러스터에서는 이 분리가 선택 사항입니다. 런타임 역할을 한 번 만드세요.

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

그런 다음 같은 호스트, 포트, 데이터베이스를 가리키는 두 연결 문자열을 SnapOtter에 전달하세요.

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

여기까지면 됩니다. SnapOtter가 권한을 직접 적용하고 마이그레이션할 때마다 다시 적용하므로, 향후 릴리스에서 추가되는 테이블도 누군가 SQL을 실행하지 않아도 함께 처리됩니다.

`DATABASE_MIGRATION_URL`에 지정한 역할은 SnapOtter 테이블을 소유해야 합니다. 테이블에 권한을 부여할 수 있는 것은 그 테이블의 소유자뿐이기 때문입니다. 기존 설치본이라면 이는 그동안 SnapOtter를 실행해 온 역할을 뜻하며, 이 용도로 새로 만든 역할이 아닙니다. 아무것도 소유하지 않은 새 역할을 지정하면 부팅이 실패하고 바로 이 내용을 알리는 오류가 표시됩니다. 또한 런타임 역할을 만들고 관리하기 위한 `CREATEROLE` 권한과 `drizzle` 스키마를 만들 권한도 필요합니다.

두 URL에 같은 역할을 지정하면 분리는 꺼지며, SnapOtter는 아닌 척하지 않고 로그에 그렇게 남깁니다. 테이블을 소유하면서 `CREATEROLE`도 가질 수 있는 역할을 제공업체가 주지 않는다면 단일 역할로 운영하세요.

### 슈퍼유저 비트를 그대로 두는 이유 {#why-the-superuser-bit-is-left-alone}

SnapOtter는 어떤 역할에서도 `SUPERUSER`를 스스로 제거하지 않습니다. 분리 이전에 만들어진 설치본에서는 `snapotter`가 클러스터의 유일한 슈퍼유저이며, 이를 강등하면 클러스터에 슈퍼유저가 하나도 남지 않아 서버를 멈춘 채 단일 사용자 모드로만 복구할 수 있게 됩니다. 그 대신 오래 유지되는 연결을 제한된 역할로 옮기는 것이 보호를 얻는 방법입니다. 슈퍼유저는 부팅되는 몇 초 동안만 연결에 올라왔다가 사라집니다.

새로 설치한 올인원에는 이런 문제가 없습니다. 여기에는 역할이 세 개 생깁니다. `postgres`(부트스트랩 슈퍼유저, SnapOtter가 사용하는 어떤 연결 문자열에도 등장하지 않음), `snapotter`(`NOSUPERUSER`, 데이터를 소유하며 부팅 시에만 연결), `snapotter_app`(행만 다루며 요청을 처리)입니다.

그래도 오래된 `snapotter`를 강등하려면, 먼저 두 번째 슈퍼유저를 만들고 그 역할로 로그인해 동작하는지 확인하세요. 그런 다음 `ALTER ROLE snapotter NOSUPERUSER`를 실행합니다.

## {#backup-and-restore} 백업 및 복원

관계형 데이터베이스는 앱의 `/data` 볼륨이 아닌 Postgres 컨테이너의 `SnapOtter-pgdata` 볼륨에 있습니다.

**검증을 통한 논리적 백업(권장)**

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

두 명령 모두 소유자인 `snapotter`로 연결하며, 앞으로도 그래야 합니다. 런타임 역할은 `drizzle` 스키마를 볼 수 없으므로 그 역할로 받은 덤프는 불완전하게 나옵니다. `--no-owner`는 복원된 개체의 소유권을 복원을 실행한 쪽에 남기므로, 소유자로 복원을 실행하면 권한이 기대하는 자리에 소유권이 놓입니다. 새 클러스터에서 한 가지 주의할 점은, `pg_dump`가 권한은 가져오지만 거기에 이름이 적힌 역할까지 가져오지는 않는다는 것입니다. 그래서 복원 전에 `snapotter_app`을 만들어 두지 않으면 `--exit-on-error`가 첫 번째 `GRANT`에서 멈춥니다. 어느 쪽이든 SnapOtter는 다음 부팅 때 권한을 다시 적용합니다.

이 데이터베이스 덤프에는 Redis의 `/data/files` 또는 내구성 있는 BullMQ 상태에 저장된 라이브러리 개체가 포함되어 있지 않습니다. [보안 및 강화](/ko/guide/security#backup-and-recovery)의 조정된 절차에 따라 백업 및 복원하세요.

**콜드 볼륨 스냅샷**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

`tar`를 사용하여 라이브 PostgreSQL 데이터 디렉터리를 복사하지 마세요. 프로젝트별로 접두사 볼륨 이름을 구성하므로 리터럴 레이블 `SnapOtter-pgdata`를 가정하는 대신 `docker inspect` 또는 스토리지 플랫폼에서 마운트된 볼륨 ID를 확인합니다.

### 1.x(SQLite)에서 마이그레이션 {#migrating-from-1-x-sqlite}

SnapOtter 1.x에서 업그레이드하는 방법은 별도의 가이드가 있습니다. [1.x에서 2.0으로 업그레이드](./upgrading)를 참고하세요. 간단히 말하면, 기존 `/data` 볼륨을 재사용하면 2.0이 첫 부팅 시 `/data/snapotter.db`를 자동으로 감지하고 가져옵니다(또는 `SQLITE_MIGRATE_PATH`를 설정해 명시적으로 지정할 수 있습니다). 먼저 `snapotter.db`만이 아니라 전체 `/data` 볼륨을 백업하세요. 1.x는 SQLite WAL 모드를 사용하므로, 중지된 컨테이너는 거의 비어 있는 `snapotter.db` 옆에 있는 `snapotter.db-wal`에 대부분의 데이터를 남겨두는 경우가 많습니다.
