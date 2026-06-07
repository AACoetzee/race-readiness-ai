// This type is the app's shared definition of a run. Most fields after `effort`
// are optional because a manual import may not contain everything Strava provides.
export type Run = {
  date: string;
  type: string;
  distanceMiles: number;
  pace: string;
  effort: "Easy" | "Moderate" | "Hard";
  elapsedTimeSeconds?: number;
  movingTimeSeconds?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  elevationGainFeet?: number;
  averageCadence?: number;
  temperatureF?: number;
  feelsLikeF?: number;
  humidityPercent?: number;
  windSpeedMph?: number;
  weatherSummary?: string;
  isRace?: boolean;
  raceDistance?: "5K" | "10K" | "Half Marathon" | "Marathon";
  source?: "Sample" | "Strava" | "Import";
  stravaActivityId?: number;
  stravaWorkoutType?: number;
};

// Sample data lets the interface work before the user connects Strava.
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
