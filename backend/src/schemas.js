const { z } = require('zod');

const detectionBody = z.object({
  item: z.string().trim().min(1).max(60),
  confidence: z.number().min(0).max(1).optional(),
});

const simulateBody = z.object({
  item: z.string().trim().min(1).max(60),
  deviceId: z.number().int().positive().optional(),
});

// editing a detection only changes which item it was
const updateDetectionBody = z.object({ item: z.string().trim().min(1).max(60) });

// ids in the URL arrive as text. Whole numbers from 1 up only.
const idParam = z.coerce.number().int().positive();

const rangeQuery =z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
  deviceId: z.coerce.number().int().positive().optional(),
});

const refillBody = z.object({ grams: z.number().int().positive().max(100000) });

const email = z.string().trim().toLowerCase().email().max(100);

// bcrypt only looks at the first 72 bytes of a password, so longer ones are refused
// instead of being silently cut short.
const password = z.string().min(8).refine((p) => Buffer.byteLength(p) <= 72, 'Password is too long (72 bytes max)');

const registerBody = z.object({ email, password, inviteCode: z.string().min(1).max(100) });

// login doesn't re-check password rules, it only has to be a non-empty string
const loginBody = z.object({ email, password: z.string().min(1).max(200) });

module.exports = {
  detectionBody, simulateBody, updateDetectionBody, idParam, rangeQuery, refillBody, registerBody, loginBody,
};
