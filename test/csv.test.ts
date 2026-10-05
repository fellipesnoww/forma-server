import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toCsv } from '../src/shared/csv/index.js';

/** Serializacao CSV compartilhada (export do audit log; Fase 6.2 reaproveita). */

function body(csv: string): string {
  return csv.slice(1);
}

describe('toCsv', () => {
  it('BOM UTF-8, CRLF entre linhas e no final', () => {
    const csv = toCsv(['a', 'b'], [[1, 'x']]);

    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(body(csv), 'a,b\r\n1,x\r\n');
  });

  it('virgula, aspas e quebra de linha vao entre aspas; aspas sao duplicadas', () => {
    const csv = toCsv(['v'], [['a,b'], ['diz "oi"'], ['linha\nnova']]);

    assert.equal(body(csv), 'v\r\n"a,b"\r\n"diz ""oi"""\r\n"linha\nnova"\r\n');
  });

  it('null e undefined viram celula vazia; numero e booleano como texto', () => {
    assert.equal(
      body(toCsv(['a', 'b', 'c', 'd'], [[null, undefined, 0, false]])),
      'a,b,c,d\r\n,,0,false\r\n',
    );
  });

  it('neutraliza formulas (CSV injection) em texto, mas nao em numero negativo', () => {
    const csv = toCsv(['v'], [['=HYPERLINK("x")'], ['+1'], ['@cmd'], ['-2'], [-2]]);

    assert.equal(body(csv), 'v\r\n"\'=HYPERLINK(""x"")"\r\n\'+1\r\n\'@cmd\r\n\'-2\r\n-2\r\n');
  });
});
