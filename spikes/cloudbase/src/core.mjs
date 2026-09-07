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

const ACTIVE_ORDER_STATUSES = new Set(['pending', 'accepted', 'cooking']);
const MEAL_SLOTS = new Set(['breakfast', 'lunch', 'dinner']);

function parseCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new TypeError('INVALID_MEAL_DATE');
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new TypeError('INVALID_MEAL_DATE');
  }
  return timestamp;
}

export function assertReservationWindow(mealDate, today) {
  const days = (parseCalendarDate(mealDate) - parseCalendarDate(today)) / 86_400_000;
  if (days < 0 || days > 7) throw new TypeError('MEAL_DATE_OUT_OF_RANGE');
}

export class InMemoryOrderRequestStore {
  #byRequest = new Map();
  #activeBySlot = new Map();
  #orders = new Map();

  create({ members, identity, familyId, requestId, mealDate, mealSlot, serverToday, payload }) {
    const member = requireFamilyMember(members, identity, familyId);
    if (member.role !== 'orderer') throw new AccessDeniedError('ORDERER_ROLE_REQUIRED');
    assertReservationWindow(mealDate, serverToday);
    if (!MEAL_SLOTS.has(mealSlot)) throw new TypeError('INVALID_MEAL_SLOT');

    const requestKey = idempotencyDocumentId({ familyId, actorId: identity.actorId, requestId });
    const payloadHash = createHash('sha256')
      .update(canonicalJson({ mealDate, mealSlot, payload }))
      .digest('hex');
    const previous = this.#byRequest.get(requestKey);
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new ConflictError();
      return { order: structuredClone(previous.order), replayed: true, existingSlot: false };
    }

    const slotKey = `${familyId}\0${mealDate}\0${mealSlot}`;
    const activeOrderId = this.#activeBySlot.get(slotKey);
    if (activeOrderId) {
      return {
        order: structuredClone(this.#orders.get(activeOrderId)),
        replayed: false,
        existingSlot: true,
      };
    }

    const order = {
      id: `order-${requestKey.slice(0, 16)}`,
      familyId,
      actorId: identity.actorId,
      mealDate,
      mealSlot,
      status: 'pending',
      payload: structuredClone(payload),
    };
    this.#orders.set(order.id, order);
    this.#activeBySlot.set(slotKey, order.id);
    this.#byRequest.set(requestKey, { payloadHash, order });
    return { order: structuredClone(order), replayed: false, existingSlot: false };
  }

  setStatus(orderId, status) {
    const order = this.#orders.get(orderId);
    if (!order) throw new TypeError('ORDER_NOT_FOUND');
    order.status = status;
    if (!ACTIVE_ORDER_STATUSES.has(status)) {
      const slotKey = `${order.familyId}\0${order.mealDate}\0${order.mealSlot}`;
      if (this.#activeBySlot.get(slotKey) === orderId) this.#activeBySlot.delete(slotKey);
    }
  }

  get size() {
    return this.#orders.size;
  }
}
