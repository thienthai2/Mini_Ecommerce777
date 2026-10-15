import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { setup } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await db().admin.count()) redirect('/admin/login');
  const needsSecret = Boolean(process.env.SETUP_SECRET?.trim());
  return <div className="container section narrow"><span className="eyebrow">ONE TIME SETUP</span><h1>ตั้งค่าร้านครั้งแรก</h1>{needsSecret && <p className="muted">กรอกรหัสติดตั้งที่คุณกำหนดเองใน SETUP_SECRET ของ Environment Variables เพื่อยืนยันสิทธิ์ตั้งค่าร้าน</p>}<form action={setup} className="form-card stack">{needsSecret && <div className="field"><label>รหัสติดตั้ง *</label><input name="setupSecret" type="password" required/></div>}<div className="field"><label>ชื่อร้าน *</label><input name="name" required/></div><div className="field"><label>อีเมล Admin *</label><input name="email" type="email" required/></div><div className="field"><label>รหัสผ่าน Admin (อย่างน้อย 8 ตัวอักษร) *</label><input name="password" type="password" minLength={8} required/></div><div className="field"><label>ธนาคารรับโอน *</label><input name="bankName" required/></div><div className="field"><label>ชื่อบัญชี *</label><input name="bankAccountName" required/></div><div className="field"><label>เลขบัญชี *</label><input name="bankAccountNumber" required/></div><button className="button wide">สร้างร้านค้า</button></form></div>;
}
