---
description: "จัดการผู้ใช้ บทบาทในตัวและบทบาทกำหนดเอง สิทธิ์ API key ทีม เซสชัน และบันทึกการตรวจสอบใน SnapOtter"
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 28b3c25775a5
---

# ผู้ใช้ บทบาท และสิทธิ์ {#users-roles-permissions}

SnapOtter มาพร้อมบทบาทในตัวสามบทบาท สิทธิ์แบบละเอียด 17 รายการ และรองรับบทบาทกำหนดเองพร้อมการควบคุมการเข้าถึงต่อเครื่องมือแบบไม่บังคับ หน้านี้ครอบคลุมโมเดลการให้สิทธิ์แบบเต็ม การกำหนดขอบเขต API key การจัดการทีม และการบันทึกการตรวจสอบ

::: tip หน้าที่เกี่ยวข้อง
[OIDC / SSO](/th/guide/oidc) | [SAML SSO](/th/guide/saml) | [SCIM Provisioning](/th/guide/scim) | [Security & Hardening](/th/guide/security)
:::

## ผู้ใช้ {#users}

### การสร้างผู้ใช้ {#creating-users}

ผู้ดูแลระบบสามารถสร้างผู้ใช้ผ่านแผงควบคุมผู้ดูแลระบบหรือเอ็นด์พอยต์ `POST /api/auth/register` ผู้ใช้แต่ละคนมีชื่อผู้ใช้ บทบาท การกำหนดทีม และที่อยู่อีเมลแบบไม่บังคับ

### ผู้ดูแลระบบเริ่มต้น {#default-admin}

ในการเริ่มต้นครั้งแรก SnapOtter จะสร้างบัญชีผู้ดูแลระบบเริ่มต้น ข้อมูลรับรองมาจากตัวแปรสภาพแวดล้อม:

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | ชื่อผู้ใช้สำหรับบัญชีผู้ดูแลระบบเริ่มแรก |
| `DEFAULT_PASSWORD` | `admin` | รหัสผ่านสำหรับบัญชีผู้ดูแลระบบเริ่มแรก |

ผู้ดูแลระบบเริ่มต้นจำเป็นต้องเปลี่ยนรหัสผ่านในการเข้าสู่ระบบครั้งแรก

### ผู้ให้บริการยืนยันตัวตน {#authentication-providers}

ผู้ใช้สามารถยืนยันตัวตนได้ผ่านหลายวิธี:

- **Local** - ชื่อผู้ใช้และรหัสผ่านที่จัดเก็บในฐานข้อมูล SnapOtter
- **OIDC** - ผู้ให้บริการ OpenID Connect ใด ๆ (ดู [OIDC / SSO](/th/guide/oidc))
- **SAML** - ผู้ให้บริการข้อมูลระบุตัวตน SAML 2.0 (ดู [SAML SSO](/th/guide/saml))
- **SCIM** - การจัดสรรอัตโนมัติจากผู้ให้บริการข้อมูลระบุตัวตน (ดู [SCIM Provisioning](/th/guide/scim))

### การปิดการยืนยันตัวตน {#disabling-authentication}

ตั้งค่า `AUTH_ENABLED=false` เพื่อปิดการยืนยันตัวตนทั้งหมด ในโหมดนี้จะใช้ผู้ใช้นิรนามสังเคราะห์ที่มีบทบาท `admin` สำหรับทุกคำขอ ไม่จำเป็นต้องเข้าสู่ระบบ

::: warning 
การปิดการยืนยันตัวตนให้สิทธิ์ผู้ดูแลระบบเต็มรูปแบบแก่ใครก็ตามที่เข้าถึงอินสแตนซ์ได้ ใช้สิ่งนี้เฉพาะในสภาพแวดล้อมที่เชื่อถือได้เท่านั้น
:::

## บทบาทในตัว {#built-in-roles}

SnapOtter มีบทบาทในตัวสามบทบาท ไม่สามารถแก้ไขหรือลบได้

### Admin {#admin}

สิทธิ์ทั้ง 17 รายการ ควบคุมอินสแตนซ์ได้อย่างเต็มรูปแบบ

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

สิทธิ์ 7 รายการ สามารถใช้เครื่องมือทั้งหมดและจัดการไฟล์และไปป์ไลน์ทั้งหมดได้ แต่ไม่สามารถเข้าถึงฟังก์ชันของผู้ดูแลระบบได้

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

สิทธิ์ 5 รายการ สามารถใช้เครื่องมือและจัดการทรัพยากรของตนเองได้

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## การอ้างอิงสิทธิ์ {#permissions-reference}

| สิทธิ์ | คำอธิบาย |
|---|---|
| `tools:use` | ใช้เครื่องมือประมวลผลใด ๆ |
| `files:own` | ดูและจัดการไฟล์ของตนเอง |
| `files:all` | ดูและจัดการไฟล์ของผู้ใช้ทั้งหมด |
| `apikeys:own` | สร้างและจัดการ API key ของตนเอง |
| `apikeys:all` | ดู API key ของผู้ใช้ทั้งหมด |
| `pipelines:own` | สร้างและจัดการไปป์ไลน์ของตนเอง |
| `pipelines:all` | ดูและจัดการไปป์ไลน์ของผู้ใช้ทั้งหมด |
| `settings:read` | ดูการตั้งค่าอินสแตนซ์ |
| `settings:write` | แก้ไขการตั้งค่าอินสแตนซ์ |
| `users:manage` | สร้าง อัปเดต และลบบัญชีผู้ใช้ |
| `teams:manage` | สร้าง อัปเดต และลบทีม |
| `features:manage` | ติดตั้งและจัดการบันเดิลฟีเจอร์ AI |
| `system:health` | เข้าถึงเอ็นด์พอยต์ health และ readiness |
| `audit:read` | ดูบันทึกการตรวจสอบและแสดงรายการบทบาท |
| `compliance:manage` | จัดการวงจร GDPR และฟีเจอร์การปฏิบัติตามข้อกำหนด |
| `webhooks:manage` | กำหนดค่า webhook ขาออก |
| `security:manage` | จัดการการตั้งค่าความปลอดภัย (IP allowlist, การบังคับใช้ SSO) |

## บทบาทกำหนดเอง {#custom-roles}

ผู้ดูแลระบบที่มีสิทธิ์ `security:manage` สามารถสร้างบทบาทกำหนดเองผ่านแผงควบคุมผู้ดูแลระบบหรือ roles API การแสดงรายการบทบาทต้องใช้ `audit:read`

### การสร้างบทบาทกำหนดเอง {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

ชื่อบทบาทต้องมี 2-30 อักขระ เป็นตัวอักษรและตัวเลขพิมพ์เล็ก พร้อมยัติภังค์และขีดล่าง

### สิทธิ์ที่สงวนไว้สำหรับผู้ดูแลระบบ {#admin-reserved-permissions}

สิทธิ์สามรายการสงวนไว้สำหรับบทบาทในตัวและไม่สามารถกำหนดให้กับบทบาทกำหนดเองได้:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

roles API จะปฏิเสธคำขอใด ๆ ที่มีสิทธิ์เหล่านี้ มีเพียงบทบาท `admin` ในตัวเท่านั้นที่มีสิทธิ์เข้าถึง

### สิทธิ์ระดับเครื่องมือ {#tool-level-permissions}

บทบาทกำหนดเองสามารถจำกัดว่าผู้ใช้เข้าถึงเครื่องมือใดได้บ้างแบบไม่บังคับ มีสองโหมดให้ใช้:

| โหมด | พฤติกรรม | ข้อกำหนดใบอนุญาต |
|---|---|---|
| `category` | จำกัดตามโมดาลิตี (image, video, audio, document, file) | ไม่มี (ฟรี) |
| `tool` | จำกัดตาม ID ของเครื่องมือแต่ละตัว | ต้องใช้ฟีเจอร์เอ็นเทอร์ไพรส์ `per_tool_permissions` |

เมื่อตั้งค่าโหมด `tool` แต่ฟีเจอร์เอ็นเทอร์ไพรส์ไม่พร้อมใช้งาน SnapOtter จะลดระดับอย่างนุ่มนวลและอนุญาตให้เข้าถึงเครื่องมือทั้งหมด

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### การลบบทบาทกำหนดเอง {#deleting-a-custom-role}

เมื่อลบบทบาทกำหนดเอง ผู้ใช้ทั้งหมดที่ได้รับมอบหมายบทบาทนั้นจะถูกกำหนดใหม่ไปยังบทบาท `user` โดยอัตโนมัติ

## ทีม {#teams}

ทีมจัดกลุ่มผู้ใช้เพื่อการจัดการพื้นที่จัดเก็บและการเก็บรักษา ทีม `Default` จะถูกสร้างในการเริ่มต้นครั้งแรก

| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `name` | string | ชื่อทีมที่ไม่ซ้ำกัน (1-50 อักขระ) |
| `storageQuota` | number | ขีดจำกัดพื้นที่จัดเก็บต่อทีมเป็นไบต์ (ใช้งานได้โดยไม่ต้องมีเอ็นเทอร์ไพรส์) |
| `retentionHours` | number | ลบเอาต์พุตอัตโนมัติหลังจากผ่านไปกี่ชั่วโมง (ต้องใช้ `team_retention_overrides`, เอ็นเทอร์ไพรส์) |
| `legalHold` | boolean | ป้องกันการลบไฟล์ของสมาชิกทีมโดยอัตโนมัติ (ต้องใช้ `legal_hold`, เอ็นเทอร์ไพรส์) |

::: info 
ทีม `Default` ไม่สามารถลบได้ ทีมที่ยังมีสมาชิกอยู่ก็ไม่สามารถลบได้ ให้กำหนดสมาชิกใหม่ก่อน
:::

## API key {#api-keys}

ผู้ใช้สามารถสร้าง API key สำหรับการเข้าถึงแบบโปรแกรม แต่ละคีย์ใช้คำนำหน้า `si_` และแสดงเพียงครั้งเดียวในตอนสร้าง

### สิทธิ์แบบกำหนดขอบเขต {#scoped-permissions}

API key สามารถมีอาร์เรย์ `permissions` แบบไม่บังคับได้ เมื่อตั้งค่าแล้ว สิทธิ์ที่มีผลสำหรับคำขอจะเป็น **การตัดกัน** ของสิทธิ์ตามบทบาทของผู้ใช้และสิทธิ์แบบกำหนดขอบเขตของคีย์ นี่หมายความว่า API key ไม่สามารถยกระดับเกินสิทธิ์ของตัวผู้ใช้เองได้

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### การหมดอายุ {#expiration}

คีย์รับ timestamp `expiresAt` แบบไม่บังคับ คีย์ที่หมดอายุจะถูกปฏิเสธในเวลายืนยันตัวตน

## บันทึกการตรวจสอบ {#audit-log}

SnapOtter บันทึกเหตุการณ์ที่เกี่ยวข้องกับความปลอดภัยในบันทึกการตรวจสอบแบบมีโครงสร้างที่จัดเก็บในตารางฐานข้อมูล `audit_log`

### การดูบันทึกการตรวจสอบ {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

ต้องใช้สิทธิ์ `audit:read` รองรับการแบ่งหน้า (`page`, `limit`) และตัวกรอง (`action`, `ip`, `from`, `to`)

### การตรวจสอบการดำเนินการของเครื่องมือ {#tool-operation-auditing}

::: warning 
เหตุการณ์ `TOOL_EXECUTED` จะ**ไม่**ถูกบันทึกโดยค่าเริ่มต้น เป็นการเลือกเข้าร่วมผ่านหนึ่งในสองเส้นทาง:

1. ตั้งค่าการตั้งค่าผู้ดูแลระบบ `auditToolOperations` เป็น `true`
2. ถือใบอนุญาตที่ใช้งานได้พร้อมฟีเจอร์ `audit_export` (มีให้ในทั้งแผนทีมและเอ็นเทอร์ไพรส์)

หากไม่มีสิ่งใดสิ่งหนึ่งเหล่านี้ การดำเนินการเครื่องมือแต่ละครั้งจะไม่ถูกบันทึกในบันทึกการตรวจสอบ
:::

### การเอ็กซ์พอร์ต {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

ต้องใช้สิทธิ์ `audit:read` และฟีเจอร์เอ็นเทอร์ไพรส์ `audit_export` (มีให้ในทั้งแผนทีมและเอ็นเทอร์ไพรส์) รองรับรูปแบบ CSV และ JSON กรองตาม `action`, `actorId`, `targetType`, `targetId`, `from` และ `to`

### การลงนามแบบทนต่อการดัดแปลง {#tamper-resistant-signing}

เมื่อเปิดใช้งาน แต่ละรายการในบันทึกการตรวจสอบจะถูกลงนามด้วย HMAC ที่ได้มาจาก `DATA_ENCRYPTION_KEY` สิ่งนี้ต้องการ:

1. การตั้งค่า `DATA_ENCRYPTION_KEY` ในสภาพแวดล้อมของคุณ
2. การเปิดใช้งานการตั้งค่าผู้ดูแลระบบ `tamperResistantAudit`
3. ใบอนุญาตเอ็นเทอร์ไพรส์พร้อมฟีเจอร์ `tamper_resistant_audit`

### การเก็บรักษา {#retention}

ตั้งค่า `AUDIT_RETENTION_DAYS` เพื่อล้างรายการเก่าโดยอัตโนมัติ ค่าเริ่มต้นคือ `0` ซึ่งหมายความว่ารายการจะถูกเก็บไว้อย่างไม่มีกำหนด

### การอ้างอิงเหตุการณ์ {#event-reference}

| เหตุการณ์ | หมวดหมู่ |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authentication |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authentication |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authentication |
| `LOGOUT` | Authentication |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | User management |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | User management |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roles |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API keys |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Settings |
| `FILE_UPLOADED`, `FILE_DELETED` | Files |
| `TOOL_EXECUTED` | Tools (เลือกเข้าร่วม) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuration |

## การจัดการเซสชัน {#session-management}

เซสชันใช้คุกกี้ ควบคุมโดย `SESSION_DURATION_HOURS` (ค่าเริ่มต้น: 168 ชั่วโมง / 7 วัน)

### การเปลี่ยนบทบาททำให้เซสชันเป็นโมฆะ {#role-changes-invalidate-sessions}

เมื่อผู้ดูแลระบบเปลี่ยนบทบาทของผู้ใช้ เซสชันที่ใช้งานอยู่ทั้งหมดของผู้ใช้นั้นจะถูกลบ ผู้ใช้ต้องเข้าสู่ระบบอีกครั้งเพื่อรับสิทธิ์ใหม่

### การป้องกันเพื่อความปลอดภัย {#safety-guards}

- **การป้องกันผู้ดูแลระบบคนสุดท้าย**: ผู้ดูแลระบบคนสุดท้ายที่เหลืออยู่ไม่สามารถถูกลดระดับไปยังบทบาทที่ต่ำกว่าได้ API จะคืนค่าข้อผิดพลาดหากคุณพยายามทำ
- **การป้องกันการลบตนเอง**: ผู้ดูแลระบบไม่สามารถลบบัญชีของตนเองผ่าน API ได้
