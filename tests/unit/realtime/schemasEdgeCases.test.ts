import { describe, expect, it } from 'vitest';
import {
  WsInboundMessageSchema,
  WsSubscribeMessageSchema,
} from '../../../src/shared/realtime/schemas.ts';

describe('Realtime Schemas Edge Cases Suite', () => {
  it('parses raw error envelope with non-string error field fallback', () => {
    // When error is a number or boolean, code falls back to 'ERROR'
    const raw = {
      error: 500,
    };
    const parsed = WsInboundMessageSchema.parse(raw);
    expect(parsed.type).toBe('error');
    if (parsed.type === 'error') {
      expect(parsed.code).toBe('ERROR');
      expect(parsed.message).toBe('ERROR');
    }
  });

  it('parses raw error envelope with non-string message field fallback', () => {
    const raw = {
      error: 'CHANNEL_LOCKED',
      message: 12345,
      channel: 'kitchen:general',
    };
    const parsed = WsInboundMessageSchema.parse(raw);
    expect(parsed.type).toBe('error');
    if (parsed.type === 'error') {
      expect(parsed.code).toBe('CHANNEL_LOCKED');
      expect(parsed.message).toBe('CHANNEL_LOCKED');
      expect(parsed.channel).toBe('kitchen:general');
    }
  });

  it('passes through null, undefined or non-object values to base schema validation', () => {
    expect(() => WsInboundMessageSchema.parse(null)).toThrow();
    expect(() => WsInboundMessageSchema.parse(undefined)).toThrow();
    expect(() => WsInboundMessageSchema.parse('invalid-string')).toThrow();
    expect(() => WsInboundMessageSchema.parse(123)).toThrow();
  });

  it('validates WsSubscribeMessageSchema strictly', () => {
    const valid = WsSubscribeMessageSchema.parse({
      type: 'subscribe',
      channels: ['waiter:1', 'kitchen:freidora'],
    });
    expect(valid.channels).toHaveLength(2);

    expect(() =>
      WsSubscribeMessageSchema.parse({
        type: 'subscribe',
        channels: [''], // min(1) violation
      }),
    ).toThrow();
  });
});

