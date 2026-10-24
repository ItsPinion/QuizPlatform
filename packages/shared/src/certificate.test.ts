import { describe, expect, it } from 'vitest';

import { certificateCode, normalizeCertificateCode } from './certificate';

describe('certificateCode', () => {
  it('has the documented shape', () => {
    expect(certificateCode()).toMatch(/^QP-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('never emits a character that can be misread', () => {
    const code = certificateCode(() => 0.999999);
    expect(code).not.toMatch(/[01OIL]/);
  });

  it('is deterministic for a given source', () => {
    // Two independent sources with the same output must agree, character for
    // character — the code is a function of `random`, nothing else.
    const sequence = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

    function source() {
      let index = 0;
      return () => sequence[index++]!;
    }

    expect(certificateCode(source())).toBe(certificateCode(source()));
  });

  it('survives a stray 1 from a mocked random', () => {
    expect(certificateCode(() => 1)).toMatch(/^QP-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe('normalizeCertificateCode', () => {
  it('upper-cases and trims', () => {
    expect(normalizeCertificateCode('  qp-ab12-cd34 ')).toBe('QP-AB12-CD34');
  });

  it('removes spaces from a pasted code', () => {
    expect(normalizeCertificateCode('QP AB12 CD34')).toBe('QPAB12CD34');
  });
});
