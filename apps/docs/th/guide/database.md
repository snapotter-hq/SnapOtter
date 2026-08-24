---
description: "สคีมาฐานข้อมูล PostgreSQL ตาราง การย้ายข้อมูล และขั้นตอนการสำรองข้อมูลสำหรับ SnapOtter"
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: ec41785970af
i18n_hash_version: 2
---

# ฐานข้อมูล {#database}

SnapOtter ใช้ PostgreSQL 17 กับ [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) สำหรับการจัดเก็บข้อมูลอย่างถาวร สคีมาถูกกำหนดไว้ใน `apps/api/src/db/schema.ts`

การเชื่อมต่อถูกกำหนดค่าผ่านตัวแปรสภาพแวดล้อม `DATABASE_URL` (ค่าเริ่มต้น `postgres://snapotter:snapotter@postgres:5432/snapotter`) ใน Docker Compose คอนเทนเนอร์ Postgres จะเก็บข้อมูลไว้ใน named volume `SnapOtter-pgdata` การร้องขอจะถูกให้บริการด้วยบทบาทที่อ่านและเขียนแถวข้อมูลได้เท่านั้น ซึ่งครอบคลุมอยู่ในหัวข้อ [บทบาทสิทธิ์ขั้นต่ำ](#least-privilege-roles) ด้านล่าง

## ตาราง {#tables}

### users {#users}

เก็บบัญชีผู้ใช้ สร้างขึ้นโดยอัตโนมัติเมื่อรันครั้งแรกจาก `DEFAULT_USERNAME` และ `DEFAULT_PASSWORD`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `username` | varchar | ไม่ซ้ำ จำเป็น |
| `passwordHash` | varchar | scrypt hash |
| `role` | varchar | `admin`, `editor` หรือ `user` |
| `mustChangePassword` | boolean | ธงบังคับรีเซ็ตรหัสผ่าน |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `updatedAt` | timestamp | เวลาที่อัปเดตล่าสุด |

### sessions {#sessions}

เซสชันการเข้าสู่ระบบที่ใช้งานอยู่ แต่ละแถวผูกโทเคนเซสชันกับผู้ใช้

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | varchar | คีย์หลัก (โทเคนเซสชัน) |
| `userId` | uuid | คีย์นอกไปยัง `users.id` |
| `expiresAt` | timestamp | เวลาหมดอายุ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### teams {#teams}

กลุ่มสำหรับจัดระเบียบผู้ใช้ ผู้ดูแลสามารถกำหนดผู้ใช้ให้กับทีมได้

| คอลัมน์ | ชนิด | คำอธิบาย |
|--------|------|-------------|
| `id` | uuid | คีย์หลัก |
| `name` | varchar (ไม่ซ้ำ สูงสุด 50 อักขระ) | ชื่อทีม |
| `createdAt` | timestamp | เวลาที่สร้าง |

### api_keys {#api-keys}

คีย์ API สำหรับการเข้าถึงแบบโปรแกรม คีย์ดิบจะแสดงเพียงครั้งเดียวตอนสร้าง เก็บเฉพาะ hash เท่านั้น

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | คีย์นอกไปยัง `users.id` |
| `keyHash` | varchar | scrypt hash ของคีย์ |
| `name` | varchar | ป้ายชื่อที่ผู้ใช้กำหนด |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `lastUsedAt` | timestamp | อัปเดตทุกครั้งที่มีการร้องขอที่ผ่านการยืนยันตัวตน |

คีย์จะขึ้นต้นด้วย `si_` ตามด้วยอักขระเลขฐานสิบหก 96 ตัว (สุ่ม 48 ไบต์)

### pipelines {#pipelines}

ชุดเครื่องมือที่บันทึกไว้ซึ่งผู้ใช้สร้างขึ้นใน UI

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `name` | varchar | ชื่อ pipeline |
| `description` | varchar | คำอธิบายที่ไม่บังคับ |
| `steps` | jsonb | อาร์เรย์ของอ็อบเจกต์ `{ toolId, settings }` |
| `createdAt` | timestamp | เวลาที่สร้าง |

### user_files {#user-files}

คลังไฟล์ถาวร โดยค่าเริ่มต้น การแก้ไขที่บันทึกไว้จะถูกแทรกเป็นแถวรากอิสระ ("บันทึกเป็นไฟล์ใหม่": `version` 1, `parentId` เป็น null ดังนั้นไฟล์ต้นฉบับยังคงอยู่ในรายการ) หรือเป็นเวอร์ชันที่เชื่อมโยงกับแถวแม่เมื่อคุณเขียนทับไฟล์ต้นฉบับ (กำหนด `parentId`, เพิ่มค่า `version` และแทนที่ไฟล์เดิม) คอลัมน์ `toolChain` บันทึกเครื่องมือที่นำมาใช้

| คอลัมน์ | ชนิด | คำอธิบาย |
|--------|------|-------------|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | FK ไปยัง users (CASCADE DELETE) |
| `originalName` | varchar | ชื่อไฟล์อัปโหลดต้นฉบับ |
| `storedName` | varchar | ชื่อไฟล์บนดิสก์ |
| `mimeType` | varchar | ชนิด MIME |
| `size` | integer | ขนาดไฟล์เป็นไบต์ |
| `width` | integer | ความกว้างของภาพเป็นพิกเซล |
| `height` | integer | ความสูงของภาพเป็นพิกเซล |
| `version` | integer | หมายเลขเวอร์ชัน (1 = ต้นฉบับ) |
| `parentId` | uuid หรือ null | FK ไปยัง user_files (เวอร์ชันแม่) |
| `toolChain` | jsonb | รหัสเครื่องมือที่นำมาใช้ตามลำดับเพื่อสร้างเวอร์ชันนี้ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### jobs {#jobs}

ติดตามงานประมวลผลสำหรับการรายงานความคืบหน้าและการล้างข้อมูล

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `type` | varchar | ตัวระบุเครื่องมือหรือ pipeline |
| `status` | varchar | `queued`, `processing`, `completed` หรือ `failed` |
| `progress` | real | เศษส่วน 0.0-1.0 |
| `inputFiles` | jsonb | อาร์เรย์ของพาธไฟล์อินพุต |
| `outputPath` | varchar | พาธไปยังไฟล์ผลลัพธ์ |
| `settings` | jsonb | การตั้งค่าเครื่องมือที่ใช้ |
| `error` | varchar | ข้อความข้อผิดพลาดหากล้มเหลว |
| `createdAt` | timestamp | เวลาที่สร้าง |
| `completedAt` | timestamp | เวลาที่เสร็จสิ้น |

### settings {#settings}

ที่เก็บแบบคีย์-ค่าสำหรับการตั้งค่าทั้งเซิร์ฟเวอร์ที่ผู้ดูแลสามารถเปลี่ยนได้จาก UI

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `key` | varchar | คีย์หลัก |
| `value` | varchar | ค่าการตั้งค่า |
| `updatedAt` | timestamp | เวลาที่อัปเดตล่าสุด |

### roles {#roles}

บทบาทกำหนดเองพร้อมสิทธิ์แบบละเอียด

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `name` | varchar | ชื่อบทบาทที่ไม่ซ้ำ |
| `description` | varchar | คำอธิบายที่ไม่บังคับ |
| `permissions` | jsonb | อาร์เรย์ของสตริงสิทธิ์ |
| `createdAt` | timestamp | เวลาที่สร้าง |

### audit_log {#audit-log}

บันทึกการกระทำที่เกี่ยวข้องกับความปลอดภัย

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | คีย์หลัก |
| `userId` | uuid | FK ไปยัง users |
| `action` | varchar | ชนิดการกระทำ |
| `details` | jsonb | ข้อมูลเฉพาะการกระทำ |
| `createdAt` | timestamp | เวลาที่กระทำ |

### user_preferences {#user-preferences}

สถานะ UI ของผู้ใช้แต่ละคน โดยใช้ชื่อการตั้งค่าเป็นคีย์ เก็บเครื่องมือที่ปักหมุดบนหน้าหลัก ซึ่งเขียนผ่าน `PUT /api/v1/preferences`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `userId` | text | FK ไปยัง users ลบแบบต่อเนื่อง เป็นคีย์หลักร่วมกับ `key` |
| `key` | text | ชื่อการตั้งค่า เป็นคีย์หลักร่วมกับ `userId` |
| `value` | jsonb | ข้อมูลของการตั้งค่า |
| `updatedAt` | timestamp | เวลาที่เขียนล่าสุด |

## การย้ายข้อมูล (Migrations) {#migrations}

Drizzle จัดการการย้ายสคีมา ไฟล์การย้ายข้อมูลอยู่ใน `apps/api/drizzle/` ระหว่างการพัฒนา:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

ในโปรดักชัน การย้ายข้อมูลที่ค้างอยู่จะถูกนำมาใช้โดยอัตโนมัติเมื่อเริ่มต้น

## บทบาทสิทธิ์ขั้นต่ำ {#least-privilege-roles}

สองบทบาท สองหน้าที่ `DATABASE_URL` ใช้ให้บริการการร้องขอ และถือสิทธิ์ `SELECT`, `INSERT`, `UPDATE`, `DELETE` บนตารางของแอป รวมถึง `USAGE` และ `SELECT` บน sequence ของตารางเหล่านั้น มีเพียงเท่านี้ทั้งหมด บทบาทนี้ไม่สามารถสร้างหรือลบตาราง ติดตั้งส่วนขยาย `TRUNCATE` อ่าน `pg_authid` สร้างฐานข้อมูล แก้ไขบทบาท หรือแตะต้องสคีมา `drizzle` ที่เก็บประวัติการย้ายข้อมูลได้

`DATABASE_MIGRATION_URL` คือบทบาทที่มีสิทธิ์สูง ใช้รันการย้ายข้อมูลและมอบสิทธิ์ให้บทบาทรันไทม์ระหว่างการบูต จากนั้นจะปิดการเชื่อมต่อก่อนที่จะมีการให้บริการการร้องขอแม้แต่รายการเดียว

Compose และอิมเมจแบบ all-in-one ถูกตั้งค่าไว้แบบนี้อยู่แล้ว รวมถึงการติดตั้งที่มีอยู่เดิมด้วย เมื่อบูต SnapOtter จะสร้างบทบาทรันไทม์หากยังไม่มี มอบสิทธิ์ให้ รันการย้ายข้อมูล แล้วกวาดมอบสิทธิ์ไปยังตารางที่มีอยู่ก่อนหน้า การอัปเกรดไม่ต้องรัน SQL ด้วยตนเอง

หากปล่อย `DATABASE_MIGRATION_URL` ว่างไว้ ระบบจะทำงานแบบบทบาทเดียว โดยให้ `DATABASE_URL` ทำหน้าที่ทั้งสองอย่างเหมือนก่อนการแยกบทบาททุกประการ นี่คือการตั้งค่าที่รองรับอย่างเป็นทางการ ไม่ใช่การตั้งค่าที่เลิกใช้แล้ว และเป็นทางเลือกที่ถูกต้องสำหรับ Postgres แบบ managed ซึ่งการสร้างบทบาทมักไม่ใช่สิ่งที่คุณทำได้เอง

### Postgres ภายนอกและแบบ managed {#external-and-managed-postgres}

บน RDS, Supabase, Cloud SQL หรือคลัสเตอร์ใดก็ตามที่คุณดูแลเอง การแยกบทบาทเป็นทางเลือกที่ต้องเปิดใช้เอง สร้างบทบาทรันไทม์เพียงครั้งเดียว:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

จากนั้นส่งสตริงการเชื่อมต่อทั้งสองให้ SnapOtter โดยชี้ไปยังโฮสต์ พอร์ต และฐานข้อมูลเดียวกัน:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

หยุดเพียงเท่านี้ SnapOtter จะมอบสิทธิ์ให้เองและมอบสิทธิ์ซ้ำหลังการย้ายข้อมูลทุกครั้ง ดังนั้นตารางที่เพิ่มเข้ามาในรุ่นถัดไปจะได้รับสิทธิ์ครบโดยไม่ต้องมีใครรัน SQL ให้

บทบาทใน `DATABASE_MIGRATION_URL` ต้องเป็นเจ้าของตารางของ SnapOtter เพราะมีเพียงเจ้าของตารางเท่านั้นที่มอบสิทธิ์บนตารางนั้นได้ สำหรับการติดตั้งที่มีอยู่เดิม นั่นหมายถึงบทบาทที่คุณใช้รัน SnapOtter มาตลอด ไม่ใช่บทบาทใหม่ที่สร้างขึ้นเพื่อการนี้โดยเฉพาะ หากชี้ไปยังบทบาทใหม่ที่ไม่ได้เป็นเจ้าของสิ่งใดเลย การบูตจะล้มเหลวพร้อมข้อความแจ้งข้อผิดพลาดที่บอกเรื่องนี้ตรงๆ นอกจากนี้ยังต้องมีสิทธิ์ `CREATEROLE` เพื่อสร้างและดูแลบทบาทรันไทม์ และต้องมีสิทธิ์สร้างสคีมา `drizzle` ด้วย

หากระบุบทบาทเดียวกันใน URL ทั้งสอง การแยกบทบาทจะไม่ทำงาน และ SnapOtter จะบอกเรื่องนี้ไว้ในล็อกแทนที่จะแกล้งทำเป็นว่าทุกอย่างปกติ หากผู้ให้บริการของคุณไม่มีบทบาทใดที่เป็นทั้งเจ้าของตารางและถือสิทธิ์ `CREATEROLE` ได้พร้อมกัน ให้ใช้งานแบบบทบาทเดียว

### เหตุใดจึงไม่แตะสถานะ superuser {#why-the-superuser-bit-is-left-alone}

SnapOtter จะไม่ถอดสิทธิ์ `SUPERUSER` ออกจากบทบาทใดด้วยตัวเองเด็ดขาด สำหรับการติดตั้งที่สร้างขึ้นก่อนการแยกบทบาท `snapotter` เป็น superuser เพียงรายเดียวของคลัสเตอร์ และการลดสิทธิ์ของบทบาทนี้จะทำให้คลัสเตอร์ไม่เหลือ superuser เลย ซึ่งกู้คืนได้ผ่านโหมดผู้ใช้เดี่ยวขณะที่เซิร์ฟเวอร์หยุดทำงานเท่านั้น สิ่งที่ให้การป้องกันแทนคือการย้ายการเชื่อมต่อที่เปิดค้างไว้ยาวนานไปยังบทบาทที่ถูกจำกัดสิทธิ์ ส่วน superuser จะอยู่บนสายเพียงไม่กี่วินาทีระหว่างการบูตแล้วก็หายไป

การติดตั้งแบบ all-in-one ที่สร้างใหม่ไม่มีปัญหานี้เลย โดยจะได้บทบาทสามรายการ ได้แก่ `postgres` (superuser สำหรับบูตสแตรป ไม่ปรากฏในสตริงการเชื่อมต่อใดๆ ที่ SnapOtter ใช้), `snapotter` (`NOSUPERUSER` เป็นเจ้าของข้อมูล เชื่อมต่อเฉพาะตอนบูต) และ `snapotter_app` (เข้าถึงเฉพาะแถวข้อมูล ใช้ให้บริการการร้องขอ)

หากยังต้องการลดสิทธิ์ `snapotter` ของการติดตั้งเดิมอยู่ดี ให้สร้าง superuser รายที่สองขึ้นมาก่อน แล้วเข้าสู่ระบบด้วยบทบาทนั้นเพื่อยืนยันว่าใช้งานได้จริง จากนั้นจึงรัน `ALTER ROLE snapotter NOSUPERUSER`

## สำรองและกู้คืน {#backup-and-restore}

ฐานข้อมูลเชิงสัมพันธ์อยู่ในโวลุ่ม `SnapOtter-pgdata` ของคอนเทนเนอร์ Postgres ไม่ใช่โวลุ่ม `/data` ของแอป

**การสำรองข้อมูลแบบลอจิคัลพร้อมการตรวจสอบความถูกต้อง (แนะนำ)**

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

คำสั่งทั้งสองเชื่อมต่อในนาม `snapotter` ซึ่งเป็นเจ้าของ และควรทำเช่นนั้นต่อไป บทบาทรันไทม์มองไม่เห็นสคีมา `drizzle` ดังนั้นดัมพ์ที่สร้างด้วยบทบาทนั้นจะออกมาไม่ครบถ้วน `--no-owner` จะทำให้อ็อบเจ็กต์ที่กู้คืนตกเป็นของผู้ที่รันการกู้คืน การรันในนามเจ้าของจึงวางความเป็นเจ้าของไว้ตรงตามที่สิทธิ์ที่มอบไว้คาดหมาย มีข้อควรระวังหนึ่งอย่างบนคลัสเตอร์ที่สร้างใหม่: `pg_dump` นำสิทธิ์ที่มอบไว้ติดไปด้วย แต่ไม่ได้นำบทบาทที่ถูกอ้างถึงไปด้วย ดังนั้นให้สร้าง `snapotter_app` ก่อนกู้คืน มิฉะนั้น `--exit-on-error` จะหยุดที่ `GRANT` แรก อย่างไรก็ตาม SnapOtter จะมอบสิทธิ์ซ้ำอีกครั้งเมื่อบูตครั้งถัดไปไม่ว่าในกรณีใดก็ตาม

ดัมพ์ฐานข้อมูลนี้ไม่มีอ็อบเจ็กต์ไลบรารีที่บันทึกไว้ใน `/data/files` หรือสถานะ BullMQ แบบทนทานใน Redis สำรองและกู้คืนข้อมูลเหล่านั้นด้วยขั้นตอนการประสานงานใน [Security & Hardening](/th/guide/security#backup-and-recovery)

**สแนปชอตวอลุ่มเย็น**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

อย่าคัดลอกไดเร็กทอรีข้อมูล PostgreSQL แบบสดด้วย `tar` เขียนคำนำหน้าชื่อวอลุ่มตามโปรเจ็กต์ ดังนั้นแก้ไข ID วอลุ่มที่ติดตั้งจาก `docker inspect` หรือแพลตฟอร์มพื้นที่จัดเก็บข้อมูลของคุณ แทนที่จะใช้ป้ายกำกับตัวอักษร `SnapOtter-pgdata`

### การย้ายข้อมูลจาก 1.x (SQLite) {#migrating-from-1-x-sqlite}

การอัปเกรดจาก SnapOtter 1.x มีคู่มือของตัวเอง ดู [การอัปเกรดจาก 1.x ไปยัง 2.0](./upgrading) สรุปสั้นๆ ให้ใช้ volume `/data` ที่มีอยู่เดิมซ้ำ และ 2.0 จะตรวจจับและนำเข้า `/data/snapotter.db` โดยอัตโนมัติเมื่อบูตครั้งแรก (หรือกำหนด `SQLITE_MIGRATE_PATH` เพื่อชี้ไปยังไฟล์นั้นอย่างชัดเจน) สำรอง volume `/data` ทั้งหมดก่อน ไม่ใช่แค่ `snapotter.db`: 1.x ใช้โหมด SQLite WAL ดังนั้นคอนเทนเนอร์ที่หยุดทำงานมักจะทิ้งข้อมูลส่วนใหญ่ไว้ใน `snapotter.db-wal` ข้างๆ `snapotter.db` ที่แทบจะว่างเปล่า
