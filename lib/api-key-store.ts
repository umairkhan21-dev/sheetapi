import type { ApiUpdateChanges } from "@/lib/api-config";
import { prisma } from "@/lib/prisma";
import {
  generateApiKey,
  hashApiKey,
  presentedKeyIsUsable,
  readBearerApiKey,
} from "@/lib/api-key";

export type PublicApiKey = {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const publicKeySelect = {
  id: true,
  name: true,
  keyPrefix: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

function toPublicApiKey(key: {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}): PublicApiKey {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
  };
}

async function findOwnedApi(userId: number, apiId: number) {
  return prisma.api.findFirst({
    where: {
      id: apiId,
      userId,
    },
    select: { id: true },
  });
}

export async function listOwnedApiKeys(userId: number, apiId: number) {
  const api = await findOwnedApi(userId, apiId);

  if (!api) {
    return null;
  }

  const keys = await prisma.apiKey.findMany({
    where: { apiId: api.id },
    orderBy: { createdAt: "desc" },
    select: publicKeySelect,
  });

  return keys.map(toPublicApiKey);
}

export async function createOwnedApiKey(
  userId: number,
  apiId: number,
  name: string,
) {
  const api = await findOwnedApi(userId, apiId);

  if (!api) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const generated = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      apiId: api.id,
      name,
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
    },
    select: publicKeySelect,
  });

  return {
    ok: true as const,
    key: toPublicApiKey(created),
    secret: generated.secret,
  };
}

export async function deleteOwnedApi(userId: number, apiId: number) {
  const deleted = await prisma.api.deleteMany({
    where: {
      id: apiId,
      userId,
    },
  });

  return deleted.count === 1;
}

const managedApiSelect = {
  id: true,
  name: true,
  slug: true,
  spreadsheetId: true,
  worksheetId: true,
  worksheetName: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function updateOwnedApi(
  userId: number,
  apiId: number,
  changes: ApiUpdateChanges,
) {
  const data: ApiUpdateChanges = {};

  if (changes.name !== undefined) {
    data.name = changes.name;
  }

  if (changes.status !== undefined) {
    data.status = changes.status;
  }

  if (data.name === undefined && data.status === undefined) {
    return null;
  }

  const updated = await prisma.api.updateMany({
    where: {
      id: apiId,
      userId,
    },
    data,
  });

  if (updated.count !== 1) {
    return null;
  }

  return prisma.api.findFirst({
    where: {
      id: apiId,
      userId,
    },
    select: managedApiSelect,
  });
}

export async function revokeOwnedApiKey(
  userId: number,
  apiId: number,
  keyId: number,
) {
  const api = await findOwnedApi(userId, apiId);

  if (!api) {
    return { ok: false as const, reason: "api_not_found" as const };
  }

  const existing = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      apiId: api.id,
    },
    select: publicKeySelect,
  });

  if (!existing) {
    return { ok: false as const, reason: "key_not_found" as const };
  }

  if (existing.revokedAt) {
    return { ok: true as const, key: toPublicApiKey(existing) };
  }

  const revoked = await prisma.apiKey.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
    select: publicKeySelect,
  });

  return { ok: true as const, key: toPublicApiKey(revoked) };
}

export async function authenticateApiKey(
  apiId: number,
  authorization: string | null,
) {
  const presented = readBearerApiKey(authorization);

  if (!presented.ok) {
    return presented;
  }

  const keyHash = hashApiKey(presented.secret);
  const stored = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      apiId: true,
      keyHash: true,
      revokedAt: true,
    },
  });

  if (!stored || !presentedKeyIsUsable(keyHash, apiId, stored)) {
    return { ok: false as const, reason: "invalid" as const };
  }

  return { ok: true as const, keyId: stored.id };
}

export async function markApiKeyUsed(keyId: number, apiId: number) {
  const updated = await prisma.apiKey.updateMany({
    where: {
      id: keyId,
      apiId,
      revokedAt: null,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return updated.count === 1;
}
