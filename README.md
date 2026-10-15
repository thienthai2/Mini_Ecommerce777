# Mini E-commerce

ร้านค้าออนไลน์ Next.js สำหรับร้านเดียว พร้อม PostgreSQL, รูปสินค้า และสลิปชำระเงิน

## Deploy บน Vercel

1. สร้าง Vercel project จาก repository นี้ แนะนำแผน Pro เมื่อใช้รับออเดอร์เชิงพาณิชย์
2. ใน Storage ของ project สร้าง PostgreSQL ผ่าน Marketplace (เช่น Neon) และเชื่อมกับ project ให้มี `DATABASE_URL` สำหรับ Production
3. สร้าง Vercel Blob **สอง store**: `products` แบบ **Public** และ `slips` แบบ **Private** เชื่อมทั้งสอง store กับ project ใน Production แล้วตั้ง `BLOB_PRODUCTS_STORE_ID` และ `BLOB_SLIPS_STORE_ID` เป็น Store ID ของแต่ละ store ใน Project Environment Variables ไม่ต้องสร้าง read/write token เมื่อเชื่อมด้วย OIDC; Vercel ส่ง `VERCEL_OIDC_TOKEN` ให้ Function โดยอัตโนมัติ
4. (ไม่บังคับ) ตั้ง `SESSION_SECRET` และ `SETUP_SECRET` ใน Vercel Environment Variables ถ้าไม่ตั้ง `SESSION_SECRET` ระบบจะสร้างคีย์ลงชื่อ session จาก `DATABASE_URL` ให้อัตโนมัติ (การเปลี่ยน `DATABASE_URL` จะทำให้ Admin ต้องล็อกอินใหม่)
5. Deploy: `vercel.json` สั่ง `npm run vercel-build` ซึ่ง generate Prisma client, รัน `prisma migrate deploy` แล้ว build Next.js หาก migration ล้มเหลว build จะหยุด
6. เปิด `/setup` แล้วกรอกค่า `SETUP_SECRET` ที่คุณตั้งไว้เพื่อสร้างร้านและ Admin ครั้งแรก (รหัสผ่าน Admin อย่างน้อย 8 ตัวอักษร) จากนั้นเพิ่มสินค้าและทดลองสั่งซื้อ/แนบสลิป

| Variable | ใช้ทำอะไร |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string จาก Marketplace |
| `DATABASE_URL_UNPOOLED` | Neon direct connection สำหรับ Prisma migration; Neon integration เพิ่มให้อัตโนมัติ หากไม่มีจะใช้ `DATABASE_URL` |
| `BLOB_PRODUCTS_STORE_ID` | Store ID ของ public Blob store สำหรับรูปสินค้า |
| `BLOB_SLIPS_STORE_ID` | Store ID ของ private Blob store สำหรับสลิป |
| `SESSION_SECRET` | (ไม่บังคับ) Signing key สำหรับ Admin session ถ้าไม่ตั้งจะใช้ค่าที่สร้างจาก `DATABASE_URL` |
| `SETUP_SECRET` | (ไม่บังคับ) รหัสติดตั้งร้านครั้งแรก ถ้าตั้งไว้ หน้า `/setup` จะขอรหัสนี้ก่อนสร้าง Admin |

หากเปิด Preview deployment ให้เชื่อม PostgreSQL และ Blob stores **แยกจาก Production** ใน Environment Variables ของ Preview เพราะ build ของ Preview จะรัน migration ด้วย ควรเลือก database region ใกล้กับ Vercel Functions เพื่อลด latency

Store ID ดูได้จากหน้า Storage ของ store หรือค่า `BLOB_STORE_ID` ที่ Vercel เพิ่มเมื่อเชื่อม store; เมื่อมีสอง store ให้คัดลอก ID ของแต่ละแห่งมาใช้ชื่อตัวแปรข้างต้น หากเป็น store แบบเก่าที่ใช้ read/write token สามารถตั้ง `BLOB_PRODUCTS_READ_WRITE_TOKEN` และ `BLOB_SLIPS_READ_WRITE_TOKEN` แทนได้ หลังแก้ Environment Variables ต้อง Redeploy เพื่อให้ Function เห็นค่าใหม่

รูปสินค้าเปิดสาธารณะผ่าน `/api/media/...`; สลิปอยู่ใน private Blob store และ route ตรวจ Admin login ก่อนส่งไฟล์ ขนาดรูปสูงสุด 5 MB และอัปโหลดจาก browser ไป Blob โดยตรง ไม่ผ่านขีดจำกัด request body ของ Vercel Function

หากย้ายร้านที่มีข้อมูลจาก Railway/S3 อยู่แล้ว ให้ย้ายไฟล์ `products/...` ไป public store และ `slips/...` ไป private store โดย **คง pathname เดิม** ก่อนเปลี่ยนเว็บไป Vercel; ค่า `imageKey` และ `slipKey` ใน PostgreSQL อ้าง pathname เหล่านี้อยู่ การย้าย PostgreSQL ต้องทำ backup/restore แยกจากการ deploy โค้ด

## พัฒนาในเครื่อง

ต้องมี Node.js 22+ และ PostgreSQL รวมทั้ง Blob stores สำหรับ development แยกจาก Production ใช้ `vercel env pull .env.local` หรือคัดลอก `.env.example` แล้วเติมค่าจริง อย่านำ secrets เข้า Git

```bash
npm install
npx prisma migrate deploy
npm run dev
```

สำหรับ Vercel Blob client upload ที่รันจาก localhost, callback จาก Vercel จะเข้าถึง localhost ไม่ได้ หากต้องการทดสอบ callback จริงให้ตั้ง `VERCEL_BLOB_CALLBACK_URL` เป็น URL ของ tunnel ตามคู่มือ Vercel Blob

## ข้อจำกัด

- ชำระเงินด้วยการโอนและตรวจสลิปด้วยคน
- ลูกค้าต้องเก็บลิงก์คำสั่งซื้อไว้; ยังไม่มีบัญชีลูกค้าหรืออีเมลแจ้งเตือน
- ร้านเดียวและ Admin บัญชีเดียวต่อ deployment
- ควรตั้ง backup ให้ PostgreSQL และ Blob ก่อนรับออเดอร์จริง
