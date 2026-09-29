export const PERMISSIONS = {
  'systems.write':   'เพิ่ม/แก้ไข/จัดลำดับระบบงาน',
  'systems.delete':  'ลบระบบงานออกจากทะเบียน',
  'systems.export':  'ส่งออกทะเบียนเป็นไฟล์ JSON',
  'chat.agent':      'เข้ากล่องแชทและตอบข้อความผู้ใช้',
  'chat.close':      'ปิดการสนทนากับผู้ใช้',
  'privacy.manage':  'จัดการข้อมูลส่วนบุคคล (PDPA) และคำขอใช้สิทธิ์',
  'users.manage':    'จัดการบัญชีผู้ใช้และกำหนดสิทธิ์',
  'audit.view':      'ดูบันทึกการกระทำ (Audit Log)',
  'settings.manage': 'ตั้งค่าระบบ (เผื่อขยายในอนาคต)',
};

export const ROLE_DEFAULTS = {
  USER: [],
  ADMIN: ['systems.write', 'systems.delete', 'systems.export', 'chat.agent', 'chat.close', 'privacy.manage', 'audit.view'],
  SUPERADMIN: Object.keys(PERMISSIONS),
};

export function effectivePerms(user) {
  if (!user) return [];
  if (user.role === 'SUPERADMIN') return Object.keys(PERMISSIONS);
  const base = ROLE_DEFAULTS[user.role] || [];
  return [...new Set([...base, ...(user.extraPerms || [])])].filter(p => !(user.blockedPerms || []).includes(p));
}

export function hasPerm(user, perm) {
  if (!user) return false;
  if (user.role === 'SUPERADMIN') return true;
  return effectivePerms(user).includes(perm);
}