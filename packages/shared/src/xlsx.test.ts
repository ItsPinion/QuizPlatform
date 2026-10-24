import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { parseQuestionImport, parseQuestionImportRows, toCsv } from './import';
import { columnIndex, isWorkbook, readWorkbook, workbookToCsv } from './xlsx';

/**
 * A workbook, built the way Excel builds one: a zip with a workbook part, its
 * relationships, a shared-string table and a worksheet.
 */
function workbook(options: {
  rows: string;
  shared?: string[];
  /** Skip the rels part, the way some exporters do. */
  noRels?: boolean;
}): Uint8Array {
  const shared = options.shared ?? [];
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0"?><workbook><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${options.rows}</sheetData></worksheet>`,
    ),
  };

  if (shared.length > 0) {
    files['xl/sharedStrings.xml'] = strToU8(
      `<sst>${shared.map((value) => `<si><t>${value}</t></si>`).join('')}</sst>`,
    );
  }

  if (!options.noRels) {
    files['xl/_rels/workbook.xml.rels'] = strToU8(
      `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    );
  }

  return zipSync(files);
}

describe('columnIndex', () => {
  it('reads single and double letters', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('B4')).toBe(1);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA1')).toBe(26);
    expect(columnIndex('AB12')).toBe(27);
  });

  it('is zero when there is no reference', () => {
    expect(columnIndex('')).toBe(0);
  });
});

describe('isWorkbook', () => {
  it('recognises a zip', () => {
    expect(isWorkbook(workbook({ rows: '' }))).toBe(true);
  });

  it('refuses text and the old binary format', () => {
    expect(isWorkbook(strToU8('question,option1'))).toBe(false);
    // `.xls` (BIFF) starts with the OLE compound-file signature.
    expect(isWorkbook(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(
      false,
    );
  });
});

describe('readWorkbook', () => {
  it('reads shared strings, numbers and inline strings', () => {
    const bytes = workbook({
      shared: ['What is 2 + 2?', 'Four', 'Three'],
      rows: `
        <row r="1">
          <c r="A1" t="s"><v>0</v></c>
          <c r="B1" t="s"><v>1</v></c>
          <c r="C1" t="s"><v>2</v></c>
          <c r="F1"><v>1</v></c>
        </row>
        <row r="2">
          <c r="A2" t="inlineStr"><is><t>Inline &amp; escaped</t></is></c>
          <c r="B2" t="str"><v>text</v></c>
        </row>`,
    });

    expect(readWorkbook(bytes)).toEqual([
      ['What is 2 + 2?', 'Four', 'Three', '', '', '1'],
      ['Inline & escaped', 'text'],
    ]);
  });

  it('places a cell by its reference, not by its order', () => {
    const bytes = workbook({
      rows: `<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>`,
    });

    expect(readWorkbook(bytes)).toEqual([['1', '', '3']]);
  });

  it('drops rows that are only whitespace', () => {
    const bytes = workbook({
      rows: `
        <row r="1"><c r="A1"><v>1</v></c></row>
        <row r="2"><c r="A2"><v> </v></c></row>
        <row r="3"><c r="A3"><v>3</v></c></row>`,
    });

    expect(readWorkbook(bytes)).toEqual([['1'], ['3']]);
  });

  it('still finds the sheet when the rels part is missing', () => {
    const bytes = workbook({ rows: `<row r="1"><c r="A1"><v>7</v></c></row>`, noRels: true });
    expect(readWorkbook(bytes)).toEqual([['7']]);
  });

  it('says so when the zip holds no worksheet', () => {
    const bytes = zipSync({ 'readme.txt': strToU8('not a workbook') });
    expect(() => readWorkbook(bytes)).toThrow(/no worksheet/i);
  });
});

describe('workbookToCsv', () => {
  it('produces text the CSV parser reads back identically', () => {
    const bytes = workbook({
      shared: ['Q, with a comma', 'One', 'Two'],
      rows: `
        <row r="1">
          <c r="A1" t="s"><v>0</v></c>
          <c r="B1" t="s"><v>1</v></c>
          <c r="C1" t="s"><v>2</v></c>
          <c r="F1"><v>1</v></c>
        </row>`,
    });

    const csv = workbookToCsv(bytes);
    expect(csv).toContain('"Q, with a comma"');

    const parsed = parseQuestionImport(`${csv}`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]?.questionText).toBe('Q, with a comma');
    expect(parsed.questions[0]?.correctIndexes).toEqual([0]);
  });

  it('refuses an empty workbook with an instruction, not a stack trace', () => {
    const bytes = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet/>') });

    expect(() => workbookToCsv(bytes)).toThrow(/no rows/i);
  });
});

describe('toCsv', () => {
  it('quotes only what has to be quoted, and doubles quotes', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'line\nbreak']])).toBe(
      'a,"b,c","say ""hi""","line\nbreak"',
    );
  });

  it('round-trips through the CSV parser', () => {
    const rows = [
      ['question', 'option1', 'option2', '', '', 'correct'],
      ['What is "4 + 4"?', '8', '9', '', '', '1'],
    ];

    expect(parseQuestionImportRows(rows).questions).toHaveLength(1);
    expect(parseQuestionImport(toCsv(rows)).questions).toEqual(
      parseQuestionImportRows(rows).questions,
    );
  });
});
