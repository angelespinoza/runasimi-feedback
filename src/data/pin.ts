import { getSetting, setSetting } from './db';

// PIN de 4 dígitos para abrir la app (teléfono perdido o compartido).
// Se guarda solo el hash SHA-256 con sal, nunca el PIN.
type StoredPin = { salt: string; hash: string };

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hash(pin: string, salt: string) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));
}

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

export async function hasPin(): Promise<boolean> {
  return !!(await getSetting<StoredPin>('pin'));
}

export async function setPin(pin: string) {
  if (!isValidPin(pin)) throw new Error('El PIN debe tener 4 dígitos');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await setSetting('pin', { salt, hash: await hash(pin, salt) } satisfies StoredPin);
}

export async function checkPin(pin: string): Promise<boolean> {
  const stored = await getSetting<StoredPin>('pin');
  return !!stored && (await hash(pin, stored.salt)) === stored.hash;
}
