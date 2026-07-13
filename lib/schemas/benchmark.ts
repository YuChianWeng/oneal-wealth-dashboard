import "server-only";

import { z } from "zod";
import { assertServerOnly } from "@/lib/server-only";

assertServerOnly();

const positive = () => z.number().finite().positive();
const finite = () => z.number().finite();
const dateOnly = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}, "invalid calendar date");

export const BenchmarkSymbolSchema = z.enum(["0050.TW", "^TWII"]);
export type BenchmarkSymbol = z.infer<typeof BenchmarkSymbolSchema>;

export const BenchmarkPointSchema = z
  .object({
    date: dateOnly,
    close: positive(),
    adjustedClose: positive(),
    volume: finite().nonnegative().optional(),
    dividend: finite().nonnegative().optional(),
    stockSplit: finite().nonnegative().optional(),
  })
  .strict();

export const BenchmarkArtifactSchema = z
  .object({
    version: z.literal(1),
    symbol: BenchmarkSymbolSchema,
    name: z.enum(["元大台灣50", "TAIEX 加權指數"]),
    basis: z.enum(["adjusted-close-total-return-proxy", "price-index"]),
    currency: z.literal("TWD"),
    exchangeTimezone: z.literal("Asia/Taipei"),
    source: z.literal("yfinance"),
    sourceVersion: z.string().trim().min(1),
    fetchedAt: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/,
        "fetchedAt must be an offset-aware Asia/Taipei timestamp",
      ),
    points: z.array(BenchmarkPointSchema).min(1),
  })
  .strict()
  .superRefine((artifact, context) => {
    const expected =
      artifact.symbol === "0050.TW"
        ? {
            name: "元大台灣50",
            basis: "adjusted-close-total-return-proxy",
          }
        : { name: "TAIEX 加權指數", basis: "price-index" };
    if (artifact.name !== expected.name) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "name does not match symbol",
      });
    }
    if (artifact.basis !== expected.basis) {
      context.addIssue({
        code: "custom",
        path: ["basis"],
        message: "basis does not match symbol",
      });
    }

    let previousDate = "";
    artifact.points.forEach((point, index) => {
      if (previousDate && point.date <= previousDate) {
        context.addIssue({
          code: "custom",
          path: ["points", index, "date"],
          message: "point dates must be strictly increasing",
        });
      }
      previousDate = point.date;
      if (
        artifact.symbol === "0050.TW" &&
        (point.volume === undefined || point.volume <= 0)
      ) {
        context.addIssue({
          code: "custom",
          path: ["points", index, "volume"],
          message: "0050.TW points require positive volume",
        });
      }
    });
  });

export type BenchmarkPoint = z.infer<typeof BenchmarkPointSchema>;
export type BenchmarkArtifact = z.infer<typeof BenchmarkArtifactSchema>;
