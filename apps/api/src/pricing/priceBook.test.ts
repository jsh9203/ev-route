import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFilePriceBook, parsePriceBook } from './priceBook';

describe('parsePriceBook', () => {
  const book = parsePriceBook({
    defaultWonPerKwh: 358,
    operators: { TE: { name: '테슬라', wonPerKwh: 400 }, ME: { wonPerKwh: null } },
  });
  it('운영사 단가가 있으면 그 값', () => {
    expect(book.quote('TE')).toEqual({ wonPerKwh: 400, source: 'operator' });
  });
  it('단가가 비었거나 없는 운영사는 기본 단가', () => {
    expect(book.quote('ME')).toEqual({ wonPerKwh: 358, source: 'default' });
    expect(book.quote('ZZ')).toEqual({ wonPerKwh: 358, source: 'default' });
    expect(book.quote(null)).toEqual({ wonPerKwh: 358, source: 'default' });
  });
  it('기본 단가도 없으면 null', () => {
    expect(parsePriceBook({ operators: {} }).quote('TE')).toBeNull();
  });
});

describe('createFilePriceBook', () => {
  it('파일을 고치면 다시 읽고, 깨진 파일이면 이전 값을 유지', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prices-')), 'prices.json');
    const warnings: string[] = [];
    const book = createFilePriceBook(file, (m) => warnings.push(m));
    expect(book.quote('TE')).toBeNull(); // 파일 없음

    fs.writeFileSync(file, JSON.stringify({ defaultWonPerKwh: 300, operators: {} }));
    expect(book.quote('TE')?.wonPerKwh).toBe(300);

    fs.writeFileSync(file, '{ 깨진 json');
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(book.quote('TE')?.wonPerKwh).toBe(300);
    expect(warnings).toHaveLength(1);
  });
});
