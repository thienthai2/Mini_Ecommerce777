'use server';

import { db } from '@/lib/db';
import { requireAdmin, signIn, signOut } from '@/lib/auth';
import { priceFromInput } from '@/lib/format';
import { verifiedImage } from '@/lib/storage';
import bcrypt from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function text(form: FormData, key: string, max = 200) {
  return String(form.get(key) ?? '').trim().slice(0, max);
}

function positiveInt(value: string, name: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 2_000_000_000) throw new Error(name + ' ไม่ถูกต้อง');
  return number;
}

export async function setup(form: FormData) {
  const expected = process.env.SETUP_SECRET?.trim();
  if (expected) {
    const a = Buffer.from(text(form, 'setupSecret', 200));
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('รหัสติดตั้งไม่ถูกต้อง');
  }
  const email = text(form, 'email').toLowerCase();
  const password = text(form, 'password', 200);
  const name = text(form, 'name');
  const bankName = text(form, 'bankName');
  const bankAccountName = text(form, 'bankAccountName');
  const bankAccountNumber = text(form, 'bankAccountNumber');
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !name) throw new Error('กรอกอีเมล ชื่อร้าน และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
  if (!bankName || !bankAccountName || !bankAccountNumber) throw new Error('ต้องกรอกบัญชีรับโอนเงินให้ครบ');
  if (await db().admin.count()) redirect('/admin/login');
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await db().$transaction(async (tx) => {
    await tx.store.create({ data: {
      id: 1, name, description: '',
      bankName, bankAccountName, bankAccountNumber,
    } });
    return tx.admin.create({ data: { email, passwordHash } });
  });
  await signIn(admin.id);
  redirect('/admin');
}

export async function login(form: FormData) {
  const email = text(form, 'email').toLowerCase();
  const admin = await db().admin.findUnique({ where: { email } });
  if (!admin || !await bcrypt.compare(text(form, 'password', 200), admin.passwordHash)) {
    redirect('/admin/login?error=1');
  }
  await signIn(admin.id);
  redirect('/admin');
}

export async function logout() {
  await signOut();
  redirect('/');
}

export async function saveStore(form: FormData) {
  await requireAdmin();
  const name = text(form, 'name');
  if (!name) throw new Error('ต้องระบุชื่อร้าน');
  if (!text(form, 'bankName') || !text(form, 'bankAccountName') || !text(form, 'bankAccountNumber')) throw new Error('ต้องกรอกบัญชีรับโอนเงินให้ครบ');
  await db().store.update({ where: { id: 1 }, data: {
    name, description: text(form, 'description', 1000),
    contactPhone: text(form, 'contactPhone', 100),
    contactLine: text(form, 'contactLine', 100),
    bankName: text(form, 'bankName', 100),
    bankAccountName: text(form, 'bankAccountName', 100),
    bankAccountNumber: text(form, 'bankAccountNumber', 100),
    shippingFee: priceFromInput(form.get('shippingFee')),
  } });
  revalidatePath('/');
  revalidatePath('/admin/settings');
  redirect('/admin/settings?saved=1');
}

export async function addCategory(form: FormData) {
  await requireAdmin();
  const name = text(form, 'name', 100);
  if (!name) throw new Error('ต้องระบุชื่อหมวดหมู่');
  await db().category.create({ data: { name } });
  revalidatePath('/');
  revalidatePath('/admin/products');
}

export async function saveProduct(form: FormData) {
  let stage = 'authorization';
  try {
    await requireAdmin();
    stage = 'validation';
    const id = text(form, 'id');
    const name = text(form, 'name');
    if (!name) throw new Error('ต้องระบุชื่อสินค้า');
    const imageKey = text(form, 'imageKey', 100) || undefined;
    if (imageKey) {
      stage = 'image';
      await verifiedImage(imageKey, 'products');
    }
    stage = 'fields';
    const categoryId = text(form, 'categoryId');
    const data = {
      name,
      description: text(form, 'description', 3000),
      price: priceFromInput(form.get('price')),
      stock: positiveInt(text(form, 'stock'), 'จำนวนสินค้า'),
      active: form.get('active') === 'on',
      categoryId: categoryId || null,
      ...(imageKey ? { imageKey } : {}),
    };
    stage = 'database';
    if (id) await db().product.update({ where: { id }, data });
    else await db().product.create({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[product-save]', {
      stage,
      name: error instanceof Error ? error.name : 'UnknownError',
      message: message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[database URL]'),
    });
    throw error;
  }
}

export async function setOrderStatus(form: FormData) {
  await requireAdmin();
  const id = text(form, 'id');
  const status = text(form, 'status');
  if (!['PAID', 'REJECTED', 'CANCELLED'].includes(status)) throw new Error('สถานะไม่ถูกต้อง');
  await db().$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new Error('ไม่พบคำสั่งซื้อ');
    if (status === 'PAID' && order.status !== 'PENDING_REVIEW') throw new Error('ต้องมีสลิปรอตรวจก่อนยืนยัน');
    if (status === 'REJECTED' && order.status !== 'PENDING_REVIEW') throw new Error('สถานะปัจจุบันไม่สามารถปฏิเสธสลิป');
    if (status === 'CANCELLED' && !['AWAITING_SLIP', 'PENDING_REVIEW', 'REJECTED'].includes(order.status)) throw new Error('ไม่สามารถยกเลิกคำสั่งซื้อนี้');
    const changed = await tx.order.updateMany({ where: { id, status: order.status }, data: { status: status as 'PAID' | 'REJECTED' | 'CANCELLED' } });
    if (changed.count !== 1) throw new Error('สถานะเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่');
    if (status === 'CANCELLED') {
      for (const item of order.items) if (item.productId) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    }
  });
  revalidatePath('/admin/orders');
  revalidatePath('/');
}

type OrderState = { error?: string; code?: string };
class CheckoutError extends Error {}

export async function createOrder(_: OrderState, form: FormData): Promise<OrderState> {
  try {
    const cart = JSON.parse(text(form, 'cart', 10000)) as Array<{ id: string; quantity: number }>;
    if (!Array.isArray(cart) || cart.length === 0 || cart.length > 50) throw new CheckoutError('ตะกร้าสินค้าไม่ถูกต้อง');
    const counts = new Map<string, number>();
    for (const item of cart) {
      if (typeof item.id !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) throw new CheckoutError('จำนวนสินค้าไม่ถูกต้อง');
      counts.set(item.id, (counts.get(item.id) || 0) + item.quantity);
    }
    const customerName = text(form, 'customerName');
    const customerEmail = text(form, 'customerEmail');
    const customerPhone = text(form, 'customerPhone');
    const address = text(form, 'address', 1000);
    if (!customerName || !/^\S+@\S+\.\S+$/.test(customerEmail) || !customerPhone || !address) throw new CheckoutError('กรอกข้อมูลจัดส่งให้ครบ');
    const code = randomBytes(16).toString('hex');
    await db().$transaction(async (tx) => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: 1 } });
      const products = await tx.product.findMany({ where: { id: { in: [...counts.keys()] }, active: true } });
      if (products.length !== counts.size) throw new CheckoutError('มีสินค้าที่ไม่พร้อมขาย');
      for (const product of products) {
        const quantity = counts.get(product.id)!;
        const updated = await tx.product.updateMany({ where: { id: product.id, active: true, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
        if (updated.count !== 1) throw new CheckoutError('สินค้า ' + product.name + ' มีจำนวนไม่พอ');
      }
      const subtotal = products.reduce((sum, product) => sum + product.price * counts.get(product.id)!, 0);
      if (subtotal + store.shippingFee > 2_000_000_000) throw new CheckoutError('ยอดคำสั่งซื้อเกินขอบเขตที่รองรับ');
      await tx.order.create({ data: {
        code, customerName, customerEmail, customerPhone, address,
        note: text(form, 'note', 1000), subtotal, shippingFee: store.shippingFee,
        total: subtotal + store.shippingFee,
        items: { create: products.map((product) => ({ productId: product.id, name: product.name, quantity: counts.get(product.id)!, unitPrice: product.price })) },
      } });
    });
    revalidatePath('/');
    return { code };
  } catch (error) {
    return { error: error instanceof CheckoutError ? error.message : 'สร้างคำสั่งซื้อไม่สำเร็จ กรุณาลองอีกครั้ง' };
  }
}
