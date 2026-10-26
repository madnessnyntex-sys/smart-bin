const { z } = require('zod');

const detectionBody = z.object({
  item: z.string().trim().min(1).max(60),
  confidence: z.number().min(0).max(1).optional(),
});

const simulateBody = z.object({
  item: z.string().trim().min(1).max(60),
  deviceId: z.number().int().positive().optional(),
});

const rangeQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
  deviceId: z.coerce.number().int().positive().optional(),
});

const refillBody = z.object({ grams: z.number().int().positive().max(100000) });

module.exports = { detectionBody, simulateBody, rangeQuery, refillBody };
