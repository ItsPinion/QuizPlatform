import { describe, expect, it } from 'vitest';

import { MAX_IMPORT_ROWS, parseCsv, parseQuestionImport } from './import';

const HEADER = 'question,option1,option2,option3,option4,correct,explanation,marks,difficulty';
const FULL_HEADER = `${HEADER},type,image,code`;

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
        type: 'MCQ',
        questionText: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctIndexes: [1],
        imageUrl: null,
        codeSnippet: null,
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
      { line: 2, message: '"correct" must be between 1 and 2 (got "9").' },
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

  it('imports a multi-answer row from a list of correct numbers', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'Which values are falsy?,0,NaN,null,[],1|3|4,,2,HARD,MULTI'].join('\n'),
    );

    expect(result.issues).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      type: 'MULTI',
      options: ['0', 'NaN', 'null', '[]'],
      correctIndexes: [0, 2, 3],
    });
  });

  it('needs two correct options for a multi-answer row', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'Two keys needed?,a,b,c,,1,,1,,MULTI'].join('\n'),
    );
    expect(result.questions).toHaveLength(0);
    expect(result.issues[0]?.message).toBe(
      'A multi-answer question needs at least two correct options (got "1").',
    );
  });

  it('refuses more than one key on a multiple-choice row', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'Two keys wrong?,a,b,c,,1|2,,1,,MCQ'].join('\n'),
    );
    expect(result.issues[0]?.message).toContain('use type = MULTI for several');
  });

  it('imports a true/false row with its pair written by the parser', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'HTML is a programming language,,,,,false,,1,,TRUE_FALSE'].join('\n'),
    );

    expect(result.issues).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      type: 'TRUE_FALSE',
      options: ['True', 'False'],
      correctIndexes: [1],
    });
  });

  it('does not let a true/false row invent its own options', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'Is this true?,Yes,No,,,,,1,,TRUE_FALSE'].join('\n'),
    );
    expect(result.issues[0]?.message).toContain('fixed True/False pair');
  });

  it('imports a fill-in-the-blank row with every listed answer accepted', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'Which keyword defines a function?,def,define,,,,,1,,FILL_BLANK'].join('\n'),
    );

    expect(result.issues).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      type: 'FILL_BLANK',
      options: ['def', 'define'],
      correctIndexes: [0, 1],
    });
  });

  it('needs at least one accepted answer for a fill-in-the-blank row', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'Type the answer,,,,,,,,,FILL_BLANK'].join('\n'),
    );
    expect(result.issues[0]?.message).toBe('Give at least one accepted answer in option1–option4.');
  });

  it('rejects an unknown type without dropping the other rows', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'A good question?,a,b,,,1,,1,,ESSAY', 'Another good one?,a,b,,,1,,1,,MCQ'].join(
        '\n',
      ),
    );

    expect(result.questions).toHaveLength(1);
    expect(result.issues[0]?.message).toContain('"type" must be one of');
  });

  it('carries an image and a code snippet on any format', () => {
    const result = parseQuestionImport(
      [
        FULL_HEADER,
        'What does this print?,10,11,,,2,,1,,MCQ,https://example.com/a.png,"console.log(1)"',
      ].join('\n'),
    );

    expect(result.questions[0]).toMatchObject({
      type: 'MCQ',
      imageUrl: 'https://example.com/a.png',
      codeSnippet: 'console.log(1)',
    });
  });

  it('rejects an image that is not a URL', () => {
    const result = parseQuestionImport(
      [FULL_HEADER, 'What is this?,a,b,,,1,,1,,MCQ,not-a-url'].join('\n'),
    );
    expect(result.issues[0]?.message).toContain('must be a full https:// URL');
  });

  it('counts data rows from 1, not from the header', () => {
    const result = parseQuestionImport(
      [HEADER, 'Ok question?,a,b,,,1,,1,', '?,a,b,,,1,,1,'].join('\n'),
    );
    expect(result.issues[0]?.line).toBe(2);
  });
});
