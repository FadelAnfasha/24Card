import { describe, it, expect } from 'vitest';
import { validateExpression } from '../validator.js';
import type { Card } from '../deck.js';

function cards(...specs: string[]): Card[] {
  // specs seperti '6H', '4S', '3D', '2C' atau 'AH'
  return specs.map((s) => {
    const suit = s.slice(-1) as Card['suit'];
    const rank = s.slice(0, -1) as Card['rank'];
    return { id: s, suit, rank };
  });
}

describe('validator', () => {
  const round = cards('6H', '4S', '3D', '2C');

  it('ekspresi valid: 6*4/(3-2)', () => {
    expect(validateExpression('6*4/(3-2)', round)).toEqual({ valid: true });
  });

  it('ekspresi valid dengan kurung: (6*3)+4+2', () => {
    expect(validateExpression('(6*3)+4+2', round)).toEqual({ valid: true });
  });

  it('hasil bukan 24 -> invalid', () => {
    const r = validateExpression('6*4+3-2', round);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('bukan 24');
  });

  it('kartu dipakai tidak cocok -> invalid', () => {
    // pakai 5 padahal kartu ronde 6,4,3,2
    const r = validateExpression('5*5-1', round);
    expect(r.valid).toBe(false);
  });

  it('pembagian non-bulat -> invalid', () => {
    // 6/(4-3) = 6 bulat... pakai kasus jelas: 6/4
    const r = validateExpression('(6/4)*4+2-3', round);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('bulat');
  });

  it('pembagian nol -> invalid', () => {
    const r = validateExpression('6*4/(3-3)', round);
    expect(r.valid).toBe(false);
  });

  it('karakter asing ditolak', () => {
    expect(validateExpression('6*4; DROP TABLE', round).valid).toBe(false);
    expect(validateExpression('6^4/(3-2)', round).valid).toBe(false);
  });

  it('struktur tidak valid (kurung tak berpasangan)', () => {
    expect(validateExpression('6*4/(3-2', round).valid).toBe(false);
  });

  it('As bisa bernilai 11: 11+11+1+1 = 24', () => {
    const aces = cards('AH', 'AS', 'AD', 'AC');
    expect(validateExpression('11+11+1+1', aces)).toEqual({ valid: true });
  });

  it('As bisa bernilai 1: semua kartu lain -> 1x', () => {
    const aces = cards('AH', 'AS', 'AD', 'AC');
    const r = validateExpression('1+1+1+1', aces);
    expect(r.valid).toBe(false); // valid secara struktur tapi hasil 4, bukan 24
    expect(r.reason).toContain('bukan 24');
  });

  it('kartu As dengan angka 11 tidak valid kalau bukan As', () => {
    const round2 = cards('6H', '4S', '3D', '2C');
    expect(validateExpression('11+11+1+1', round2).valid).toBe(false);
  });
});
