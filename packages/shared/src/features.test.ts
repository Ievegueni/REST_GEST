import { describe, expect, it } from 'vitest';
import { effectiveFeatures } from './features';

describe('effectiveFeatures', () => {
  it('STOCK não inclui módulos do COMPLETO', () => {
    const f = effectiveFeatures('STOCK');
    expect(f.has('stock')).toBe(true);
    expect(f.has('hr')).toBe(false);
  });
  it('COMPLETO inclui tudo', () => {
    expect(effectiveFeatures('COMPLETO').has('ai_analyzer')).toBe(true);
  });
  it('overrides ligam e desligam features', () => {
    const f = effectiveFeatures('COMPLETO', { ai_analyzer: false });
    expect(f.has('ai_analyzer')).toBe(false);
    expect(effectiveFeatures('STOCK', { hr: true }).has('hr')).toBe(true);
  });
  it('ignora chaves desconhecidas', () => {
    const f = effectiveFeatures('STOCK', { nope: true } as never);
    expect(f.size).toBe(6);
  });
});
