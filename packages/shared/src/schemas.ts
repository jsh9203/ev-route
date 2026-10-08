import { z } from 'zod';

export const PlaceSchema = z.object({
  name: z.string().max(200).optional(),
  lng: z.number().min(124).max(132),
  lat: z.number().min(33).max(39),
});
export type Place = z.infer<typeof PlaceSchema>;

const pct = z.number().min(0).max(100);

export const RecommendRequestSchema = z.object({
  origin: PlaceSchema,
  destination: PlaceSchema,
  vehicle: z.object({
    presetId: z.string(),
    currentSocPct: pct,
    arriveSocPct: pct.default(20),
    reserveSocPct: pct.default(10),
    chargeCapSocPct: pct.default(80),
  }),
  preferences: z
    .object({
      minOutputKw: z.number().min(0).default(100),
      preferredOperatorIds: z.array(z.string()).default([]),
      bufferKm: z.number().min(0.5).max(10).default(3),
      allowFullStations: z.boolean().default(false),
      forceCharge: z.boolean().default(false),
      /** 최적 대비 SCORING.superchargerPreferToleranceMin 이내면 슈퍼차저를 1순위로, 아니어도 대안에 포함 */
      preferSupercharger: z.boolean().default(false),
      /** 슈퍼차저 중에서만 추천 */
      superchargerOnly: z.boolean().default(false),
    })
    .default({
      minOutputKw: 100, preferredOperatorIds: [], bufferKm: 3, allowFullStations: false, forceCharge: false,
      preferSupercharger: false, superchargerOnly: false,
    }),
});
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;
/** 클라이언트가 보내는 형태 (기본값 있는 필드는 생략 가능) */
export type RecommendRequestInput = z.input<typeof RecommendRequestSchema>;
