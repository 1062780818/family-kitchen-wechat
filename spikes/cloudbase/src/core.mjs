import { createHash } from 'node:crypto';

export class AccessDeniedError extends Error {
  constructor(message = 'ACCESS_DENIED') {
    super(message);
    this.code = 'ACCESS_DENIED';
  }
}

export class ConflictError extends Error {
  constructor(message = 'IDEMPOTENCY_CONFLICT') {
    super(message);
    this.code = 'IDEMPOTENCY_CONFLICT';
  }
}

export function trustedWechatIdentity(serverContext) {
  const openId = serverContext?.openId;
  if (!openId || serverContext?.isAnonymous === true) {
    throw new AccessDeniedError('TRUSTED_WECHAT_IDENTITY_REQUIRED');
  }
  return Object.freeze({ actorId: openId, source: 'trusted-server-context' });
}

export function requireFamilyMember(members, identity, familyId) {
  const member = members.find(
    (candidate) =>
      candidate.familyId === familyId &&
      candidate.actorId === identity.actorId &&
      candidate.status === 'active',
  );
  if (!member) throw new AccessDeniedError();
  return member;
}

export class PrivatePhotoStore {
  #files = new Map();

  constructor(members) {
    this.members = members;
  }

  upload({ identity, familyId, fileId, bytes, contentType }) {
    requireFamilyMember(this.members, identity, familyId);
    if (
      !fileId ||
      !Buffer.isBuffer(bytes) ||
      bytes.length === 0 ||
      !contentType?.startsWith('image/')
    ) {
      throw new TypeError('INVALID_TEST_IMAGE');
    }
    if (this.#files.has(fileId)) throw new ConflictError('FILE_ID_CONFLICT');
    this.#files.set(fileId, {
      fileId,
      familyId,
      ownerId: identity.actorId,
      contentType,
      bytes: Buffer.from(bytes),
    });
    return { fileId, familyId, ownerId: identity.actorId };
  }

  read({ identity, fileId }) {
    const file = this.#files.get(fileId);
    if (!file) return null;
    requireFamilyMember(this.members, identity, file.familyId);
    return { ...file, bytes: Buffer.from(file.bytes) };
  }

  delete({ identity, fileId }) {
    const file = this.#files.get(fileId);
    if (!file) return false;
    requireFamilyMember(this.members, identity, file.familyId);
    if (file.ownerId !== identity.actorId) throw new AccessDeniedError('FILE_OWNER_REQUIRED');
    return this.#files.delete(fileId);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function idempotencyDocumentId({ familyId, actorId, requestId }) {
  if (
    ![familyId, actorId, requestId].every((value) => typeof value === 'string' && value.length > 0)
  ) {
    throw new TypeError('INVALID_IDEMPOTENCY_KEY');
  }
  return createHash('sha256').update(`${familyId}\0${actorId}\0${requestId}`).digest('hex');
}

export class AtomicMemoryRepository {
  #documents = new Map();

  createIfAbsent(id, document) {
    const existing = this.#documents.get(id);
    if (existing) return { created: false, document: existing };
    const stored = structuredClone(document);
    this.#documents.set(id, stored);
    return { created: true, document: stored };
  }

  get size() {
    return this.#documents.size;
  }
}

export function idempotentWrite({ repository, members, identity, familyId, requestId, payload }) {
  requireFamilyMember(members, identity, familyId);
  const id = idempotencyDocumentId({ familyId, actorId: identity.actorId, requestId });
  const payloadHash = createHash('sha256').update(canonicalJson(payload)).digest('hex');
  const candidate = { id, familyId, actorId: identity.actorId, requestId, payloadHash, payload };
  const result = repository.createIfAbsent(id, candidate);
  if (result.document.payloadHash !== payloadHash) throw new ConflictError();
  return { id, replayed: !result.created, payload: structuredClone(result.document.payload) };
}
