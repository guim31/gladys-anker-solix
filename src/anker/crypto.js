// -----------------------------------------------------------------------------
// Password encryption of the Anker cloud login.
//
// The login never sends the password in clear: the client generates an ECDH
// key pair on the NIST P-256 curve, derives a shared secret with the public
// key of the Anker servers, and encrypts the password with AES-256-CBC, the
// secret as key and its first 16 bytes as IV (PKCS#7 padding). The request
// carries the client public key (uncompressed point, hex) so the server can
// derive the same secret. Scheme documented by thomluther/anker-solix-api
// (session.py, MIT).
// -----------------------------------------------------------------------------

import { createCipheriv, createECDH } from 'node:crypto';

/** Public key of the Anker power cloud (EU and COM servers share it). */
export const ANKER_SERVER_PUBLIC_KEY =
  '04c5c00c4f8d1197cc7c3167c52bf7acb054d722f0ef08dcd7e0883236e0d72a3868d9750cb47fa4619248f3d83f0f662671dadc6e2d31c2f41db0161651c7c076';

/**
 * A fresh key pair and the secret it shares with the server.
 * @param {string} [serverPublicKeyHex] tests pass their own server key
 * @returns {{ publicKey: string, sharedSecret: Buffer }}
 */
export function createKeyExchange(serverPublicKeyHex = ANKER_SERVER_PUBLIC_KEY) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    // Uncompressed point: 0x04 + 32-byte x + 32-byte y, in hex.
    publicKey: ecdh.getPublicKey('hex', 'uncompressed'),
    sharedSecret: ecdh.computeSecret(Buffer.from(serverPublicKeyHex, 'hex')),
  };
}

/**
 * Encrypt a text with the shared secret, as the login expects it.
 * @param {string} text
 * @param {Buffer} sharedSecret 32 bytes
 * @returns {string} base64
 */
export function encryptWithSecret(text, sharedSecret) {
  const cipher = createCipheriv('aes-256-cbc', sharedSecret, sharedSecret.subarray(0, 16));
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
}
