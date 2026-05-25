export type Run = {
  date: string;
  type: string;
  distanceMiles: number;
  pace: string;
  effort: "Easy" | "Moderate" | "Hard";
};

export const sampleRuns: Run[] = [
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