---
description: "ตั้งค่าการจัดสรร SCIM 2.0 เพื่อซิงก์ผู้ใช้และกลุ่มจากผู้ให้บริการข้อมูลประจำตัว (identity provider) ของคุณไปยัง SnapOtter ครอบคลุม Okta, Azure AD / Entra ID และการผสานรวมแบบกำหนดเอง"
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 8629fd86555f
---

# การจัดสรรด้วย SCIM {#scim-provisioning}

SnapOtter รองรับ SCIM 2.0 (System for Cross-domain Identity Management) สำหรับการจัดสรรผู้ใช้และกลุ่มแบบอัตโนมัติ ผู้ให้บริการข้อมูลประจำตัวของคุณสามารถสร้าง อัปเดต ปิดใช้งาน และเปิดใช้งานบัญชีผู้ใช้ใหม่ รวมถึงซิงก์การเป็นสมาชิกกลุ่มได้โดยอัตโนมัติ

::: tip คุณสมบัติสำหรับองค์กร (Enterprise)
การจัดสรรด้วย SCIM ต้องใช้ไลเซนส์ **enterprise** ที่มีคุณสมบัติ `scim` ไม่มีให้ใช้งานในแผน team หากไม่มีคุณสมบัตินี้ ปลายทาง SCIM ทั้งหมด (ยกเว้น discovery) จะคืนค่า 403
:::

## ข้อกำหนดเบื้องต้น {#prerequisites}

- อินสแตนซ์ SnapOtter ที่ทำงานอยู่และเข้าถึงได้ผ่าน URL สาธารณะ
- คีย์ไลเซนส์ enterprise ที่มีคุณสมบัติ `scim`
- สิทธิ์ผู้ดูแลระบบใน SnapOtter (ต้องมีสิทธิ์ `users:manage` เพื่อสร้างหรือเพิกถอนโทเคน SCIM)
- สิทธิ์ผู้ดูแลระบบในการตั้งค่าการจัดสรรของผู้ให้บริการข้อมูลประจำตัวของคุณ

## เริ่มต้นใช้งานอย่างรวดเร็ว {#quick-start}

1. สร้างโทเคน bearer สำหรับ SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

การตอบกลับจะมีโทเคนอยู่ด้วย บันทึกไว้ทันที เพราะไม่สามารถเรียกดูได้อีก

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. ในผู้ให้บริการข้อมูลประจำตัวของคุณ กำหนดค่าการจัดสรร SCIM ด้วย:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentication**: โทเคน Bearer (วางโทเคนจากขั้นตอนที่ 1)

## การยืนยันตัวตน {#authentication}

ปลายทาง SCIM ใช้โทเคน Bearer เฉพาะ ซึ่งแยกจากเซสชันผู้ใช้และคีย์ API

### การสร้างโทเคน {#generating-a-token}

`POST /api/v1/enterprise/scim/token` สร้างโทเคน SCIM ใหม่ ปลายทางนี้ต้องมีเซสชันที่ถูกต้องพร้อมสิทธิ์ `users:manage`

โทเคนจะถูกคืนค่าเป็นข้อความธรรมดาเพียงครั้งเดียวเท่านั้น SnapOtter จัดเก็บเฉพาะแฮชแบบ scrypt เท่านั้น หากคุณทำโทเคนหาย ให้เพิกถอนและสร้างใหม่

มีโทเคน SCIM ที่ใช้งานได้เพียงหนึ่งโทเคนในแต่ละครั้ง การสร้างโทเคนใหม่จะแทนที่โทเคนก่อนหน้า

### การเพิกถอนโทเคน {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` เพิกถอนโทเคน SCIM ปัจจุบัน ปลายทางนี้ก็ต้องมี `users:manage` เช่นกัน

### การจำกัดอัตรา {#rate-limiting}

ปลายทาง SCIM ถูกจำกัดอัตราไว้ที่ 1000 คำขอต่อนาทีต่อโทเคน หากเกินขีดจำกัดนี้จะคืนค่า HTTP 429

## ทรัพยากรที่รองรับ {#supported-resources}

| ทรัพยากร SCIM | แนวคิดใน SnapOtter | สร้าง | อ่าน | อัปเดต | ลบ |
|---|---|---|---|---|---|
| User | บัญชีผู้ใช้ | ได้ | ได้ | ได้ | ลบแบบซอฟต์ |
| Group | Team | ได้ | ได้ | ได้ | ได้ |

::: warning 
Groups ใน SCIM แมปกับ **teams** ของ SnapOtter ไม่ใช่บทบาท (roles) SCIM ไม่สามารถตั้งค่าบทบาทของผู้ใช้ได้ ผู้ใช้ทั้งหมดที่สร้างผ่าน SCIM จะได้รับบทบาท `user` หากต้องการเปลี่ยนบทบาทของผู้ใช้ ให้ใช้ UI ผู้ดูแลระบบของ SnapOtter
:::

## การดำเนินการกับผู้ใช้ {#user-operations}

### สร้างผู้ใช้ {#create-user}

`POST /api/v1/scim/v2/Users`

สร้างบัญชีผู้ใช้ใหม่โดยตั้งค่า `authProvider` เป็น `scim` และบทบาท `user` ผู้ใช้จะถูกกำหนดให้อยู่ในทีม Default หาก `active` เป็น `false` บทบาทจะถูกตั้งเป็น `disabled` แทน

แอตทริบิวต์ที่จำเป็น: `userName` ทางเลือก: `externalId`, `emails`, `active` (ค่าเริ่มต้น `true`)

### แสดงรายการและกรองผู้ใช้ {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

คืนค่ารายการผู้ใช้แบบแบ่งหน้า รองรับพารามิเตอร์ query `startIndex` และ `count` (สูงสุด 200 ผลลัพธ์ต่อหน้า)

การกรองรองรับเฉพาะ `eq` (เท่ากับ) เท่านั้น บนแอตทริบิวต์เหล่านี้:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

ตัวดำเนินการและแอตทริบิวต์การกรองอื่น ๆ จะคืนค่า HTTP 400

### รับข้อมูลผู้ใช้ {#get-user}

`GET /api/v1/scim/v2/Users/:id`

คืนค่าผู้ใช้รายเดียวตาม ID ผู้ใช้ SnapOtter ของพวกเขา

### แทนที่ผู้ใช้ {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

แทนที่แอตทริบิวต์ของผู้ใช้ รองรับ `userName`, `externalId`, `emails` และ `active` การเปลี่ยนชื่อผู้ใช้จะถูกตรวจสอบความขัดแย้ง (409 หากชื่อผู้ใช้ใหม่ถูกใช้โดยผู้ใช้อื่นแล้ว)

### แพตช์ผู้ใช้ {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

อัปเดตบางส่วนโดยใช้ SCIM PatchOp การดำเนินการที่รองรับ:

| การดำเนินการ | Paths |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | เหมือนกับ `replace` |
| `remove` | `externalId`, `emails` |

พาธ `name.formatted` และ `displayName` ได้รับการยอมรับเพื่อความเข้ากันได้ แต่ไม่มีผลถาวร (SnapOtter ไม่ได้จัดเก็บชื่อที่แสดงแยกต่างหาก)

การดำเนินการ `replace` แบบไม่มีค่า (ที่ค่าเป็นออบเจกต์โดยไม่มี `path`) ก็รองรับเช่นกัน โดยมีคีย์ `userName`, `externalId`, `emails` และ `active`

### ปิดใช้งานผู้ใช้ (ลบแบบซอฟต์) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter ไม่ลบผู้ใช้แบบถาวรผ่าน SCIM แต่ DELETE จะทำการปิดใช้งานแบบซอฟต์แทน:

1. บทบาทของผู้ใช้จะถูกเปลี่ยนจากค่าปัจจุบัน (เช่น `editor`) เป็น `disabled:editor` โดยเก็บบทบาทเดิมไว้
2. รหัสผ่านของผู้ใช้จะถูกล้าง
3. เซสชันที่ใช้งานอยู่ทั้งหมดจะถูกเพิกถอน
4. คีย์ API ทั้งหมดจะถูกเพิกถอน

ผู้ใช้จะไม่สามารถเข้าสู่ระบบหรือใช้คีย์ API ใด ๆ ได้อีกต่อไป ข้อมูลของพวกเขา (ไฟล์ ประวัติ) จะยังคงถูกเก็บไว้

### เปิดใช้งานผู้ใช้อีกครั้ง {#reactivate-user}

หากต้องการเปิดใช้งานผู้ใช้ที่เคยถูกปิดใช้งานไปแล้วอีกครั้ง ให้ส่งคำขอ `PUT` หรือ `PATCH` พร้อม `active: true` SnapOtter จะกู้คืนบทบาทเดิมจากก่อนการปิดใช้งาน (เช่น `disabled:editor` จะกลายเป็น `editor` อีกครั้ง) หากไม่สามารถระบุบทบาทเดิมได้ จะย้อนกลับไปใช้ `user`

::: details ตัวอย่าง: ปิดใช้งานและเปิดใช้งานอีกครั้งผ่าน PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## การดำเนินการกับกลุ่ม {#group-operations}

Groups ใน SCIM แมปกับทีมของ SnapOtter การสร้างกลุ่มจะสร้างทีม การเป็นสมาชิกกลุ่มจะควบคุมว่าผู้ใช้อยู่ในทีมใด

### สร้างกลุ่ม {#create-group}

`POST /api/v1/scim/v2/Groups`

จำเป็น: `displayName` ทางเลือก: `members` (อาร์เรย์ของ `{ value: userId }`)

### แสดงรายการและกรองกลุ่ม {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

การกรองรองรับเฉพาะ `displayName eq "..."` เท่านั้น แบ่งหน้าด้วย `startIndex` และ `count` (สูงสุด 200 ผลลัพธ์ต่อหน้า)

### รับข้อมูลกลุ่ม {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### แทนที่กลุ่ม {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

แทนที่ชื่อกลุ่มและรายการสมาชิกทั้งหมด สมาชิกที่มีอยู่แต่ไม่อยู่ในรายการใหม่จะถูกย้ายไปยังทีม Default

### แพตช์กลุ่ม {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

รองรับการดำเนินการเหล่านี้:

| การดำเนินการ | Path | ผลลัพธ์ |
|---|---|---|
| `add` | `members` | เพิ่มผู้ใช้เข้าทีม |
| `remove` | `members[value eq "userId"]` | ย้ายผู้ใช้ไปยังทีม Default |
| `replace` | `displayName` | เปลี่ยนชื่อทีม |
| `replace` | `members` | แทนที่สมาชิกทั้งหมด (สมาชิกที่ถูกลบออกจะย้ายไปยังทีม Default) |

### ลบกลุ่ม {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

ลบทีม สมาชิกทั้งหมดของทีมที่ถูกลบจะถูกย้ายไปยังทีม Default ผู้ใช้จะไม่ถูกปิดใช้งานหรือลบ

## การตั้งค่า IdP {#idp-setup}

### Okta {#okta}

1. ในคอนโซลผู้ดูแลระบบ Okta ให้เปิดแอปพลิเคชัน SnapOtter ของคุณ (หรือสร้างใหม่)
2. ไปที่แท็บ **Provisioning** แล้วคลิก **Configure API Integration**
3. เลือก **Enable API Integration** และป้อน:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: โทเคน bearer สำหรับ SCIM ที่สร้างไว้ข้างต้น
4. คลิก **Test API Credentials** แล้วคลิก **Save**
5. ภายใต้ **Provisioning > To App** ให้เปิดใช้งาน:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. ภายใต้ **Push Groups** ให้กำหนดค่าว่ากลุ่ม Okta ใดที่จะซิงก์เป็นทีมของ SnapOtter

### Azure AD / Entra ID {#azure-ad-entra-id}

1. ในพอร์ทัล Azure ให้ไปที่แอปพลิเคชันสำหรับองค์กร SnapOtter ของคุณ
2. ไปที่ **Provisioning** และตั้ง **Provisioning Mode** เป็น **Automatic**
3. ภายใต้ **Admin Credentials** ให้ป้อน:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: โทเคน bearer สำหรับ SCIM ที่สร้างไว้ข้างต้น
4. คลิก **Test Connection** แล้วคลิก **Save**
5. ภายใต้ **Mappings** ให้กำหนดค่าการแมปแอตทริบิวต์ของผู้ใช้และกลุ่ม โดยปกติค่าเริ่มต้นจะใช้งานได้ แต่ให้ตรวจสอบว่า `userName` แมปกับ `userPrincipalName` หรือ `mail` ตามที่ต้องการ
6. ตั้ง **Provisioning Status** เป็น **On** แล้วบันทึก

Azure จัดสรรผู้ใช้และกลุ่มตามรอบการซิงก์ที่กำหนดไว้ (โดยทั่วไปทุก ๆ 40 นาที)

## ปลายทางสำหรับ Discovery {#discovery-endpoints}

ปลายทางทั้งสามนี้ใช้งานได้โดยไม่ต้องยืนยันตัวตน และอธิบายความสามารถของเซิร์ฟเวอร์ SCIM:

| ปลายทาง | คำอธิบาย |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | ความสามารถของเซิร์ฟเวอร์และคุณสมบัติที่รองรับ |
| `GET /api/v1/scim/v2/Schemas` | คำนิยาม schema ของ User และ Group |
| `GET /api/v1/scim/v2/ResourceTypes` | ประเภททรัพยากรที่ใช้ได้ (User, Group) |

`ServiceProviderConfig` ประกาศความสามารถเหล่านี้:

| คุณสมบัติ | รองรับ |
|---|---|
| Patch | ได้ |
| Bulk | ไม่ได้ |
| Filter | ได้ (สูงสุด 200 ผลลัพธ์ ตัวดำเนินการ `eq` เท่านั้น) |
| Change password | ไม่ได้ |
| Sort | ไม่ได้ |
| ETag | ไม่ได้ |

## ข้อจำกัด {#limitations}

- **การกรอง**: รองรับเฉพาะตัวดำเนินการ `eq` เท่านั้น ตัวกรองที่ซับซ้อน ตัวดำเนินการ `and`/`or`, `co` (contains) และ `sw` (starts with) ไม่ได้ถูกนำมาใช้งาน
- **การดำเนินการแบบ Bulk**: ไม่รองรับ
- **Sort และ ETag**: ไม่รองรับ
- **บทบาท**: SCIM ไม่สามารถกำหนดบทบาทของ SnapOtter ได้ ผู้ใช้ที่จัดสรรทั้งหมดจะได้รับบทบาท `user`
- **MAX_USERS**: ขีดจำกัดของตัวแปรสภาพแวดล้อม `MAX_USERS` ไม่ได้ถูกบังคับใช้เมื่อสร้างผู้ใช้ผ่าน SCIM หากคุณต้องการจำกัดจำนวนผู้ใช้ ให้จัดการการมอบหมายใน IdP ของคุณ
- **หนึ่งโทเคน**: มีโทเคน SCIM ที่ใช้งานได้เพียงหนึ่งโทเคนในแต่ละครั้ง หาก IdP หลายรายต้องเข้าถึง SCIM พวกเขาต้องใช้โทเคนร่วมกัน
- **กลุ่มคือทีม**: Groups ใน SCIM สอดคล้องกับทีม ไม่ใช่บทบาทหรือกลุ่มสิทธิ์

## การแก้ไขปัญหา {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

ไลเซนส์ของคุณไม่มีคุณสมบัติ `scim` หรือไม่มีการกำหนดค่าไลเซนส์ SCIM ต้องใช้ไลเซนส์แผน enterprise ตรวจสอบว่าตั้งค่า `SNAPOTTER_LICENSE_KEY` ไว้แล้วและไลเซนส์รวมคุณสมบัติ `scim` ด้วย

### 401 "Bearer token required" {#_401-bearer-token-required}

คำขอ SCIM ไม่ได้รวมส่วนหัว `Authorization: Bearer <token>` ตรวจสอบการกำหนดค่าการจัดสรรของ IdP ของคุณ

### 401 "Invalid token" {#_401-invalid-token}

โทเคนไม่ตรงกับแฮชที่จัดเก็บไว้ กรณีนี้เกิดขึ้นหากโทเคนถูกเพิกถอนและสร้างใหม่ อัปเดตโทเคนในการตั้งค่าการจัดสรรของ IdP ของคุณ

### 401 "SCIM not configured" {#_401-scim-not-configured}

ยังไม่มีการสร้างโทเคน SCIM ใช้ปลายทาง `POST /api/v1/enterprise/scim/token` เพื่อสร้างโทเคน

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

มีผู้ใช้ที่มีชื่อผู้ใช้เดียวกันอยู่แล้ว กรณีนี้สามารถเกิดขึ้นได้เมื่อ IdP ลองสร้างใหม่หลังจากที่ล้มเหลว ตรวจสอบชื่อผู้ใช้ที่ซ้ำกันในแผงผู้ดูแลระบบของ SnapOtter

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP กำลังส่งคำขอมากกว่า 1000 คำขอต่อนาที กรณีนี้มักเกิดขึ้นระหว่างการซิงก์ครั้งแรกขนาดใหญ่ IdP ส่วนใหญ่จะลองใหม่โดยอัตโนมัติหลังจากหน้าต่างการจำกัดอัตรารีเซ็ต หากปัญหายังคงอยู่ ให้ตรวจสอบช่วงเวลาการซิงก์การจัดสรรของ IdP ของคุณ

### ผู้ใช้ถูกยกเลิกการจัดสรรแต่ไม่ถูกลบออกจาก UI {#users-deprovisioned-but-not-removed-from-the-ui}

DELETE ของ SCIM คือการปิดใช้งานแบบซอฟต์ ผู้ใช้ที่ถูกปิดใช้งานจะยังคงปรากฏในรายการผู้ใช้ของผู้ดูแลระบบพร้อมสถานะปิดใช้งาน นี่เป็นการออกแบบเพื่อให้ข้อมูลของพวกเขาถูกเก็บรักษาไว้ บทบาทของพวกเขาจะแสดงเป็น `disabled:<original-role>`
