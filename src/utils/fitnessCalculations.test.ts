import { describe, expect, it } from "vitest";
import type { Run } from "../data/sampleRuns";
import {
  calculateFitnessBreakdown,
  calculateFitnessScore,
  calculateLongestRun,
  calculateRacePredictions,
  calculateRacePredictionsFromHistory,
  calculateCurrentRaceCapabilities,
  calculateTotalMiles,
  calculateTrainingLoad,
  calculateTrainingLoadMetrics,
  calculateTrainingLoadTimeline,
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

  it("uses the strongest recent race tag instead of only the latest race", () => {
    const raceHistory: Run[] = [
      ...baseRuns,
      {
        date: "2026-04-19",
        type: "Strong Marathon",
        distanceMiles: 26.2,
        pace: "7:18 /mi",
        effort: "Hard",
        elapsedTimeSeconds: 3 * 3600 + 11 * 60 + 21,
        isRace: true,
        raceDistance: "Marathon",
      },
      {
        date: "2026-06-06",
        type: "Slower 10K",
        distanceMiles: 6.2,
        pace: "6:53 /mi",
        effort: "Hard",
        elapsedTimeSeconds: 42 * 60 + 41,
        isRace: true,
        raceDistance: "10K",
      },
    ];

    const latestRaceOnly = calculateRacePredictions(
      raceHistory,
      "10K",
      "42:41",
      18
    );
    const strongestHistory = calculateRacePredictionsFromHistory(
      raceHistory,
      "10K",
      "42:41",
      18
    );

    expect(convertRaceTimeToMinutes(strongestHistory.halfMarathon)).toBeLessThan(
      convertRaceTimeToMinutes(latestRaceOnly.halfMarathon)
    );
    expect(convertRaceTimeToMinutes(strongestHistory.halfMarathon)).toBeLessThan(93);
  });

  it("shows current capability without conservative training penalties", () => {
    const sparseRuns: Run[] = [
      {
        date: "2026-05-01",
        type: "5K Race",
        distanceMiles: 3.1,
        pace: "7:15 /mi",
        effort: "Hard",
        elapsedTimeSeconds: 22 * 60 + 30,
        isRace: true,
        raceDistance: "5K",
      },
    ];
    const capabilities = calculateCurrentRaceCapabilities(
      sparseRuns,
      "5K",
      "22:30"
    );
    const readinessPrediction = calculateRacePredictions(
      sparseRuns,
      "5K",
      "22:30"
    );

    expect(convertRaceTimeToMinutes(capabilities.halfMarathon)).toBeLessThan(
      convertRaceTimeToMinutes(readinessPrediction.halfMarathon)
    );
    expect(capabilities.fiveK).toBe("22:30");
  });

  it("preserves a proven same-distance race result in current capability", () => {
    const halfRaceTime = "1:28:09";
    const capabilities = calculateCurrentRaceCapabilities(
      [
        {
          date: "2026-03-15",
          type: "Half Marathon Race",
          distanceMiles: 13.27,
          pace: "6:39 /mi",
          effort: "Hard",
          elapsedTimeSeconds: 88 * 60 + 9,
          isRace: true,
          raceDistance: "Half Marathon",
        },
      ],
      "10K",
      "42:41"
    );

    expect(capabilities.halfMarathon).toBe(halfRaceTime);
  });

  it("calculates acute load, chronic load, form, and status", () => {
    const runs: Run[] = [
      {
        date: "2026-04-22",
        type: "Easy Run",
        distanceMiles: 10,
        pace: "9:00 /mi",
        effort: "Easy",
      },
      {
        date: "2026-04-29",
        type: "Easy Run",
        distanceMiles: 10,
        pace: "9:00 /mi",
        effort: "Easy",
      },
      {
        date: "2026-05-06",
        type: "Easy Run",
        distanceMiles: 10,
        pace: "9:00 /mi",
        effort: "Easy",
      },
      {
        date: "2026-05-13",
        type: "Easy Run",
        distanceMiles: 10,
        pace: "9:00 /mi",
        effort: "Easy",
      },
      {
        date: "2026-05-20",
        type: "Easy Run",
        distanceMiles: 10,
        pace: "9:00 /mi",
        effort: "Easy",
      },
      {
        date: "2026-05-24",
        type: "Workout",
        distanceMiles: 8,
        pace: "7:30 /mi",
        effort: "Hard",
        averageHeartRate: 170,
        maxHeartRate: 185,
      },
      {
        date: "2026-05-27",
        type: "Long Run",
        distanceMiles: 10,
        pace: "8:40 /mi",
        effort: "Moderate",
      },
    ];

    const metrics = calculateTrainingLoadMetrics(runs);

    expect(metrics.acuteLoad).toBeGreaterThan(metrics.chronicLoad);
    expect(metrics.form).toBeLessThan(0);
    expect(metrics.status).toBe("Overreaching");
  });

  it("builds a daily training load timeline", () => {
    const timeline = calculateTrainingLoadTimeline(baseRuns, 3);

    expect(timeline).toHaveLength(7);
    expect(timeline.at(-1)).toMatchObject({
      date: "2026-05-07",
      totalMiles: 38,
      acuteLoad: 30,
    });
  });

  it("shows positive form after a taper because fatigue falls faster than fitness", () => {
    const trainingBlock: Run[] = Array.from({ length: 8 }, (_, week) => {
      const date = new Date(Date.UTC(2026, 2, 1 + week * 7))
        .toISOString()
        .slice(0, 10);

      return {
        date,
        type: "Long Run",
        distanceMiles: 12,
        pace: "8:00 /mi",
        effort: "Moderate" as const,
      };
    });
    const finalBuildRun: Run = {
      date: "2026-04-19",
      type: "Workout",
      distanceMiles: 10,
      pace: "7:20 /mi",
      effort: "Hard",
    };
    const raceWeekShakeout: Run = {
      date: "2026-05-01",
      type: "Shakeout",
      distanceMiles: 2,
      pace: "9:00 /mi",
      effort: "Easy",
    };

    const buildMetrics = calculateTrainingLoadMetrics([
      ...trainingBlock,
      finalBuildRun,
    ]);
    const taperedMetrics = calculateTrainingLoadMetrics([
      ...trainingBlock,
      finalBuildRun,
      raceWeekShakeout,
    ]);

    expect(taperedMetrics.acuteLoad).toBeLessThan(buildMetrics.acuteLoad);
    expect(taperedMetrics.chronicLoad).toBeGreaterThan(taperedMetrics.acuteLoad);
    expect(taperedMetrics.form).toBeGreaterThan(0);
    expect(taperedMetrics.status).toBe("Fresh");
  });
});
