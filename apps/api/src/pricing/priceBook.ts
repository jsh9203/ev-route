// 운영사별 충전 단가표 (data/prices.json). 파일이 바뀌면 다음 조회 때 다시 읽는다.
import fs from 'node:fs';
import { z } from 'zod';
import type { ChargingFee } from '@ev-route/shared';

const FileSchema = z.object({
  defaultWonPerKwh: z.number().positive().nullable().default(null),
  operators: z
    .record(z.string(), z.object({ name: z.string().optional(), wonPerKwh: z.number().positive().nullable().default(null) }))
    .default({}),
});

export type PriceQuote = Pick<ChargingFee, 'wonPerKwh' | 'source'>;

export interface PriceBook {
  /** 단가를 하나도 모르면(기본 단가도 없음) null */
  quote(operatorId: string | null): PriceQuote | null;
}

export function parsePriceBook(json: unknown): PriceBook {
  const f = FileSchema.parse(json);
  return {
    quote(operatorId) {
      const own = operatorId ? f.operators[operatorId]?.wonPerKwh : null;
      if (own) return { wonPerKwh: own, source: 'operator' };
      if (f.defaultWonPerKwh) return { wonPerKwh: f.defaultWonPerKwh, source: 'default' };
      return null;
    },
  };
}

const EMPTY: PriceBook = { quote: () => null };

export function createFilePriceBook(path: string, log: (msg: string) => void = console.warn): PriceBook {
  let loadedMtime = -1;
  let book: PriceBook = EMPTY;
  return {
    quote(operatorId) {
      try {
        const mtime = fs.statSync(path).mtimeMs;
        if (mtime !== loadedMtime) {
          loadedMtime = mtime;
          book = parsePriceBook(JSON.parse(fs.readFileSync(path, 'utf8')));
        }
      } catch (e) {
        // 파일이 없거나 형식이 틀리면 마지막으로 읽은 값을 유지
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log(`단가 파일을 읽지 못했습니다 (${path}): ${(e as Error).message}`);
      }
      return book.quote(operatorId);
    },
  };
}
