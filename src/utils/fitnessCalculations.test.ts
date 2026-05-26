import { describe, expect, it } from "vitest";
import type { Run } from "../data/sampleRuns";
import {
  calculateFitnessBreakdown,
  calculateFitnessScore,
  calculateLongestRun,
  calculateRacePredictions,
  calculateTotalMiles,
  calculateTrainingLoad,
  convertRaceTimeToMinutes,
} from "./fitnessCalculations";

const baseRuns: Run[] = [
  {
    date: "2026-05-01",
    type: "Easy Run",
    distanceMiles: 8,
    pace: "8:20 /mi",
    effort: "Easy",
  },
  {
    date: "2026-05-03",
    type: "Workout",
    distanceMiles: 8,
    pace: "7:10 /mi",
    effort: "Hard",
  },
  {
    date: "2026-05-05",
    type: "Recovery Run",
    distanceMiles: 6,
    pace: "8:45 /mi",
    effort: "Easy",
  },
  {
    date: "2026-05-07",
    type: "Long Run",
    distanceMiles: 16,
    pace: "8:05 /mi",
    effort: "Moderate",
  },
];

describe("fitness calculations", () => {
  it("calculates total miles, longest run, and fitness score", () => {
    expect(calculateTotalMiles(baseRuns)).toBe(38);
    expect(calculateLongestRun(baseRuns)).toBe(16);
    expect(calculateFitnessScore(baseRuns)).toBe(96);
  });

  it("handles an empty run list without infinite values", () => {
    expect(calculateTotalMiles([])).toBe(0);
    expect(calculateLongestRun([])).toBe(0);
    expect(calculateFitnessScore([])).toBe(13);
    expect(calculateTrainingLoad([])).toBe("Low");
    expect(calculateFitnessBreakdown([])).toEqual({
      mileage: "Needs work",
      longRun: "Needs work",
      consistency: "Needs work",
    });
  });

  it("converts valid race times to minutes", () => {
    expect(convertRaceTimeToMinutes("22:30")).toBe(22.5);
    expect(convertRaceTimeToMinutes("1:43:20")).toBeCloseTo(103.3333, 4);
    expect(convertRaceTimeToMinutes(" 02:05 ")).toBeCloseTo(2.0833, 4);
  });

  it("rejects invalid race times", () => {
    expect(convertRaceTimeToMinutes("")).toBe(0);
    expect(convertRaceTimeToMinutes("abc")).toBe(0);
    expect(convertRaceTimeToMinutes("22")).toBe(0);
    expect(convertRaceTimeToMinutes("22:60")).toBe(0);
    expect(convertRaceTimeToMinutes("1:60:00")).toBe(0);
    expect(convertRaceTimeToMinutes("-1:30")).toBe(0);
    expect(convertRaceTimeToMinutes("1:")).toBe(0);
    expect(convertRaceTimeToMinutes("1.5:30")).toBe(0);
  });

  it("calculates race predictions from a past race", () => {
    expect(calculateRacePredictions(baseRuns, "5K", "22:30")).toEqual({
      fiveK: "22:30",
      tenK: "46:55",
      halfMarathon: "1:43:40",
      marathon: "3:36:08",
    });
  });

  it("keeps race prediction formatting valid when rounding carries seconds", () => {
    const predictions = calculateRacePredictions([], "10K", "39:59");

    for (const time of Object.values(predictions)) {
      expect(time).not.toMatch(/:60(?:$|:)/);
    }
  });
});
