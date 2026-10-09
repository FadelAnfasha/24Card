// Verifikasi: validator nerima As sebagai 11 (dan 1).
import { validateExpression } from '../src/game/validator.js';
import type { Card } from '../src/game/deck.js';

function mk(specs: string[]): Card[] {
  return specs.map((s) => {
    const suit = s.slice(-1) as Card['suit'];
    const rank = s.slice(0, -1) as Card['rank'];
    return { id: s, suit, rank };
  });
}

// A,3,4,6 -> solve cuma kalo As=11: 11+3+4+6 = 24
const cards = mk(['AS', '3S', '4S', '6S']);
const as11 = validateExpression('(11+3+4+6)', cards);
const as1 = validateExpression('(1+3+4+6)', cards);
console.log('As=11 (11+3+4+6):', JSON.stringify(as11));
console.log('As=1  (1+3+4+6):', JSON.stringify(as1), '(harus invalid: hasil 14)');
console.log(as11.valid && !as1.valid ? 'TOGGLE AS OK' : 'CEK GAGAL');
