import { describe, expect, it } from 'vitest';

import { MAX_IMPORT_ROWS, parseCsv, parseQuestionImport } from './import';

const HEADER = 'question,option1,option2,option3,option4,correct,explanation,marks,difficulty';

describe('parseCsv', () => {
  it('splits rows and cells', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a comma inside quotes', () => {
    expect(parseCsv('"Hello, world",x')).toEqual([['Hello, world', 'x']]);
  });

  it('turns a doubled quote into one quote', () => {
    expect(parseCsv('"She said ""hi""",x')).toEqual([['She said "hi"', 'x']]);
  });

  it('keeps a newline inside quotes', () => {
    expect(parseCsv('"line one\nline two",x')).toEqual([['line one\nline two', 'x']]);
  });

  it('handles CRLF and a trailing newline without inventing a row', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('strips the BOM Excel writes', () => {
    expect(parseCsv('\uFEFFa,b')[0]).toEqual(['a', 'b']);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n\nc,d')).toHaveLength(2);
  });
});

describe('parseQuestionImport', () => {
  it('parses a file with a header', () => {
    const result = parseQuestionImport(
      [HEADER, 'What is 2+2?,3,4,5,6,2,Because maths,1,EASY'].join('\n'),
    );

    expect(result.issues).toEqual([]);
    expect(result.questions).toEqual([
      {
        questionText: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctIndex: 1,
        explanation: 'Because maths',
        marks: 1,
        difficulty: 'EASY',
      },
    ]);
  });

  it('works without a header', () => {
    const result = parseQuestionImport('What is 2+2?,3,4,,,2,,,');
    expect(result.issues).toEqual([]);
    expect(result.questions[0]?.options).toEqual(['3', '4']);
    expect(result.questions[0]?.marks).toBe(1);
    expect(result.questions[0]?.difficulty).toBe('MEDIUM');
  });

  it('reports a bad correct column instead of dropping the whole file', () => {
    const result = parseQuestionImport(
      [HEADER, 'Good question here?,a,b,,,1,,1,', 'Bad row?,a,b,,,9,,1,'].join('\n'),
    );

    expect(result.questions).toHaveLength(1);
    expect(result.issues).toEqual([
      { line: 2, message: '"correct" must be a column number between 1 and 2 (got "9").' },
    ]);
  });

  it('needs two options', () => {
    const result = parseQuestionImport('Only one option?,a,,,,1,,,');
    expect(result.questions).toHaveLength(0);
    expect(result.issues[0]?.message).toBe('Give at least 2 options.');
  });

  it('rejects a question without text', () => {
    const result = parseQuestionImport('?,a,b,,,1,,,');
    expect(result.issues[0]?.message).toBe('Question text must be at least 5 characters.');
  });

  it('rejects an unknown difficulty', () => {
    const result = parseQuestionImport('A good question?,a,b,,,1,,1,IMPOSSIBLE');
    expect(result.issues[0]?.message).toBe('"difficulty" must be EASY, MEDIUM or HARD.');
  });

  it('refuses a file with no rows at all', () => {
    expect(parseQuestionImport('').issues[0]?.message).toBe('The file is empty.');
    expect(parseQuestionImport(HEADER).issues[0]?.message).toBe(
      'The file has a header but no rows.',
    );
  });

  it('caps the batch', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => 'A good question?,a,b,,,1,,1,');
    const result = parseQuestionImport([HEADER, ...rows].join('\n'));
    expect(result.questions).toHaveLength(0);
    expect(result.issues[0]?.message).toContain(`at most ${MAX_IMPORT_ROWS}`);
  });

  it('counts data rows from 1, not from the header', () => {
    const result = parseQuestionImport(
      [HEADER, 'Ok question?,a,b,,,1,,1,', '?,a,b,,,1,,1,'].join('\n'),
    );
    expect(result.issues[0]?.line).toBe(2);
  });
});
