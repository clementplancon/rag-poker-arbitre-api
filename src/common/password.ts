import * as argon2 from 'argon2';

export async function hashPassword(pwd: string) {
  return argon2.hash(pwd, { type: argon2.argon2id });
}
export async function verifyPassword(hash: string, pwd: string) {
  return argon2.verify(hash, pwd);
}
