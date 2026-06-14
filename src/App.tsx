import { useEffect, useRef, useState } from "react";
import "./index.css";
import { sampleRuns, type Run } from "./data/sampleRuns";
import { generateAICoachSummary } from "./utils/aiCoachSummary";

import {
  calculateFitnessScore,
  calculateLongestRun,
  calculateNumberOfRuns,
  calculateTotalMiles,
  calculateRacePredictionsFromHistory,
  calculateCurrentRaceCapabilities,
  calculateFitnessBreakdown,
  calculateTrainingLoad,
  calculateTrainingLoadMetrics,
  calculateRunTrainingStress,
  calculateTrainingLoadTimeline,
  convertRaceTimeToMinutes,
} from "./utils/fitnessCalculations";

import {
  addDays,
  formatDateForInput,
  getDaysBetweenDates,
} from "./utils/dateUtils";

import StatCard from "./components/StatCard";
import RunCard from "./components/RunCard";

/*
 * FRONTEND MAP
 *
 * This file is the main React screen. It does four large jobs:
 * 1. Stores the user's data and choices in React state.
 * 2. Calculates useful numbers from the run data.
 * 3. Calls the backend for Strava data and AI-generated content.
 * 4. Chooses which page or dashboard section to display.
 *
 * A future cleanup could split these jobs into smaller components and hooks.
 */

// These URLs point to routes in server.js. An empty API_BASE_URL means the
// frontend and backend are reached through the same host during development.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const AI_SUMMARY_URL = `${API_BASE_URL}/api/ai-summary`;
const TRAINING_PLAN_URL = `${API_BASE_URL}/api/training-plan`;
const COACH_CHECK_IN_URL = `${API_BASE_URL}/api/coach-check-in`;
const ACTIVITY_INSIGHT_URL = `${API_BASE_URL}/api/activity-insight`;
const STRAVA_RUNS_URL = `${API_BASE_URL}/api/strava/runs`;
const RECENT_RUN_LIMIT = 4;
const TRAINING_WINDOW_DAYS = 7;
const TREND_WINDOW_DAYS = 90;
const RECENT_BASELINE_WINDOW_DAYS = 42;
const SAVED_RUNS_KEY = "race-readiness-runs";
const SAVED_TRAINING_PLAN_KEY = "race-readiness-training-plan";
const SAVED_PLAN_PREFERENCES_KEY = "race-readiness-plan-preferences";
const SAVED_MAX_HEART_RATE_KEY = "race-readiness-max-heart-rate";
const SAVED_DISTANCE_UNIT_KEY = "race-readiness-distance-unit";
const KILOMETERS_PER_MILE = 1.609344;

// A union type is a short list of the only allowed string values.
// TypeScript will warn us if we accidentally use an unknown page name.
type PageView = "dashboard" | "trainingPlan" | "activityDetail";
type DashboardView = "overview" | "calendar" | "activities" | "zones" | "coach";
type DistanceUnit = "mi" | "km";

function getStorage() {
  // localStorage belongs to the browser. The try/catch prevents the whole app
  // from crashing in environments where browser storage is blocked.
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

type HeartRateZone = {
  name: string;
  label: string;
  range: string;
  description: string;
};

type PlanWeek = {
  week: number;
  phase: string;
  targetMiles: number;
  longRunMiles: number;
  workoutFocus: string;
  easyRunGuidance: string;
  notes: string;
  locked?: boolean;
};

type TrainingPlan = {
  title: string;
  overview: string;
  confidence: "Low" | "Medium" | "High";
  assumptions: string[];
  whyThisPlan?: string[];
  heartRateMax: number | null;
  heartRateGuidance: string[];
  heartRateZones: HeartRateZone[];
  weeks: PlanWeek[];
};

type TrainingPlanPreferences = {
  goalFocus: string;
  daysPerWeek: number;
  longRunDay: string;
  restDay: string;
  planStyle: string;
  injuryStatus: string;
  notes: string;
};

type PaceZone = {
  name: string;
  label: string;
  range: string;
  description: string;
};

type CoachInsight = {
  headline: string;
  whatChanged: string;
  nextMove: string;
  watchOut: string;
};

type ActivityInsight = {
  headline: string;
  summary: string;
  effortAssessment: string;
  positives: string[];
  watchOuts: string[];
  nextStep: string;
  dataLimitations: string[];
};

type PlannedWorkout = {
  date: string;
  title: string;
  type: "Long run" | "Workout" | "Easy";
  miles: number;
  week: number;
};

function isRun(value: unknown): value is Run {
  // Imported JSON and API responses cannot be trusted automatically.
  // This "type guard" checks the data at runtime before the app uses it as a Run.
  if (!value || typeof value !== "object") {
    return false;
  }

  const run = value as Run;

  return (
    typeof run.date === "string" &&
    typeof run.type === "string" &&
    typeof run.distanceMiles === "number" &&
    Number.isFinite(run.distanceMiles) &&
    run.distanceMiles > 0 &&
    typeof run.pace === "string" &&
    ["Easy", "Moderate", "Hard"].includes(run.effort) &&
    (run.elapsedTimeSeconds === undefined ||
      (typeof run.elapsedTimeSeconds === "number" &&
        Number.isFinite(run.elapsedTimeSeconds) &&
        run.elapsedTimeSeconds > 0)) &&
    (run.movingTimeSeconds === undefined ||
      (typeof run.movingTimeSeconds === "number" &&
        Number.isFinite(run.movingTimeSeconds) &&
        run.movingTimeSeconds > 0)) &&
    (run.isRace === undefined || typeof run.isRace === "boolean") &&
    (run.raceDistance === undefined ||
      ["5K", "10K", "Half Marathon", "Marathon"].includes(run.raceDistance)) &&
    (run.averageHeartRate === undefined ||
      (typeof run.averageHeartRate === "number" &&
        Number.isFinite(run.averageHeartRate))) &&
    (run.maxHeartRate === undefined ||
      (typeof run.maxHeartRate === "number" && Number.isFinite(run.maxHeartRate))) &&
    (run.elevationGainFeet === undefined ||
      (typeof run.elevationGainFeet === "number" &&
        Number.isFinite(run.elevationGainFeet))) &&
    (run.averageCadence === undefined ||
      (typeof run.averageCadence === "number" &&
        Number.isFinite(run.averageCadence))) &&
    (run.temperatureF === undefined ||
      (typeof run.temperatureF === "number" && Number.isFinite(run.temperatureF))) &&
    (run.feelsLikeF === undefined ||
      (typeof run.feelsLikeF === "number" && Number.isFinite(run.feelsLikeF))) &&
    (run.humidityPercent === undefined ||
      (typeof run.humidityPercent === "number" &&
        Number.isFinite(run.humidityPercent))) &&
    (run.windSpeedMph === undefined ||
      (typeof run.windSpeedMph === "number" && Number.isFinite(run.windSpeedMph))) &&
    (run.weatherSummary === undefined || typeof run.weatherSummary === "string") &&
    (run.stravaActivityId === undefined ||
      (typeof run.stravaActivityId === "number" &&
        Number.isFinite(run.stravaActivityId)))
  );
}

function getRunTimeMs(run: Run) {
  return new Date(`${run.date}T00:00:00`).getTime();
}

function getWindowRuns(runs: Run[], windowDays: number) {
  if (runs.length === 0) {
    return [];
  }

  const latestRunTime = Math.max(...runs.map(getRunTimeMs));
  const trainingWindowStart = latestRunTime - (windowDays - 1) * 24 * 60 * 60 * 1000;

  return runs.filter((run) => {
    const runTime = getRunTimeMs(run);

    return runTime >= trainingWindowStart && runTime <= latestRunTime;
  });
}

function getAverageWeeklyMiles(runs: Run[], windowDays: number) {
  return calculateTotalMiles(runs) / (windowDays / 7);
}

function getObservedMaxHeartRate(runs: Run[]) {
  const heartRates = runs.flatMap((run) => [
    run.maxHeartRate,
    run.averageHeartRate,
  ]);
  const validHeartRates = heartRates.filter(
    (heartRate): heartRate is number =>
      typeof heartRate === "number" && Number.isFinite(heartRate)
  );

  return validHeartRates.length > 0 ? Math.max(...validHeartRates) : null;
}

function formatHeartRateRange(
  maxHeartRate: number | null,
  minPercent: number,
  maxPercent: number
) {
  if (!maxHeartRate) {
    return "Needs HR data";
  }

  const min = Math.round(maxHeartRate * minPercent);
  const max = Math.round(maxHeartRate * maxPercent);

  return `${min}-${max} bpm`;
}

function createHeartRateZones(maxHeartRate: number | null): HeartRateZone[] {
  return [
    {
      name: "Z1",
      label: "Recovery",
      range: formatHeartRateRange(maxHeartRate, 0.5, 0.6),
      description: "Very easy days and warmups",
    },
    {
      name: "Z2",
      label: "Easy aerobic",
      range: formatHeartRateRange(maxHeartRate, 0.6, 0.7),
      description: "Most normal running",
    },
    {
      name: "Z3",
      label: "Steady",
      range: formatHeartRateRange(maxHeartRate, 0.7, 0.8),
      description: "Controlled moderate running",
    },
    {
      name: "Z4",
      label: "Threshold",
      range: formatHeartRateRange(maxHeartRate, 0.8, 0.9),
      description: "Tempo and longer intervals",
    },
    {
      name: "Z5",
      label: "Hard",
      range: formatHeartRateRange(maxHeartRate, 0.9, 1),
      description: "Short reps and race efforts",
    },
  ];
}

function getRaceDistanceMiles(raceDistance: string) {
  if (raceDistance === "5K") {
    return 3.1;
  }

  if (raceDistance === "10K") {
    return 6.2;
  }

  if (raceDistance === "Half Marathon") {
    return 13.1;
  }

  return 26.2;
}

function formatPaceFromMinutes(minutesPerMile: number, distanceUnit: DistanceUnit) {
  const minutesPerUnit =
    distanceUnit === "km" ? minutesPerMile / KILOMETERS_PER_MILE : minutesPerMile;
  const totalSeconds = Math.max(0, Math.round(minutesPerUnit * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /${distanceUnit}`;
}

function getGoalPaceMinutes(goalRace: string, selectedGoalTime: string) {
  const goalTimeMinutes = convertRaceTimeToMinutes(selectedGoalTime);

  if (goalTimeMinutes <= 0) {
    return null;
  }

  return goalTimeMinutes / getRaceDistanceMiles(goalRace);
}

function createPaceZones(
  goalRace: string,
  selectedGoalTime: string,
  distanceUnit: DistanceUnit
): PaceZone[] {
  const goalPace = getGoalPaceMinutes(goalRace, selectedGoalTime);

  if (!goalPace) {
    return [
      {
        name: "Pace",
        label: "Needs race estimate",
        range: "Not available",
        description: "Import race data or enter a valid past race time.",
      },
    ];
  }

  return [
    {
      name: "Easy",
      label: "Aerobic",
      range: `${formatPaceFromMinutes(goalPace + 1.5, distanceUnit)}-${formatPaceFromMinutes(goalPace + 2.5, distanceUnit)}`,
      description: "Most normal running and recovery days",
    },
    {
      name: "Steady",
      label: "Controlled",
      range: `${formatPaceFromMinutes(goalPace + 0.75, distanceUnit)}-${formatPaceFromMinutes(goalPace + 1.5, distanceUnit)}`,
      description: "Comfortably moderate running",
    },
    {
      name: "Tempo",
      label: "Threshold",
      range: `${formatPaceFromMinutes(goalPace + 0.2, distanceUnit)}-${formatPaceFromMinutes(goalPace + 0.6, distanceUnit)}`,
      description: "Sustained workout efforts",
    },
    {
      name: "Race",
      label: goalRace,
      range: `${formatPaceFromMinutes(goalPace - 0.1, distanceUnit)}-${formatPaceFromMinutes(goalPace + 0.1, distanceUnit)}`,
      description: "Current estimated goal-race pace",
    },
    {
      name: "Fast",
      label: "Speed",
      range: `${formatPaceFromMinutes(goalPace - 0.75, distanceUnit)}-${formatPaceFromMinutes(goalPace - 0.25, distanceUnit)}`,
      description: "Short intervals and strides",
    },
  ];
}

function getWeekdayIndex(dayName: string) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(dayName);
}


function getWeekdayDate(weekStart: Date, dayName: string) {
  const requestedDay = getWeekdayIndex(dayName);
  const safeDay = requestedDay >= 0 ? requestedDay : 0;
  const offset = (safeDay - weekStart.getDay() + 7) % 7;

  return addDays(weekStart, offset);
}

function getWorkoutDay(longRunDay: string, restDay: string) {
  // Pick a workout day that avoids the runner's requested rest and long-run days.
  const preferredDays = ["Tuesday", "Wednesday", "Thursday", "Friday", "Monday"];

  return (
    preferredDays.find((day) => day !== longRunDay && day !== restDay) ??
    "Tuesday"
  );
}

function getWeeklyRunDays(preferences: TrainingPlanPreferences) {
  const allDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const workoutDay = getWorkoutDay(preferences.longRunDay, preferences.restDay);
  const desiredRunDays = Math.min(7, Math.max(3, preferences.daysPerWeek));
  const availableDays = allDays.filter(
    (day) => day !== preferences.restDay || desiredRunDays === 7
  );
  const selectedDays = new Set([preferences.longRunDay, workoutDay]);

  // Prefer days that create a familiar quality/easy/long-run weekly rhythm.
  const preferredEasyDays = [
    "Wednesday",
    "Friday",
    "Saturday",
    "Monday",
    "Thursday",
    "Tuesday",
    "Sunday",
  ];

  for (const day of preferredEasyDays) {
    if (selectedDays.size >= desiredRunDays) {
      break;
    }

    if (availableDays.includes(day)) {
      selectedDays.add(day);
    }
  }

  return {
    workoutDay,
    runDays: allDays.filter((day) => selectedDays.has(day)),
  };
}

function splitMileage(totalMiles: number, numberOfRuns: number) {
  if (numberOfRuns <= 0) {
    return [];
  }

  const baseMiles = Math.floor((totalMiles / numberOfRuns) * 10) / 10;
  const mileages = Array.from({ length: numberOfRuns }, () => baseMiles);
  const assignedMiles = baseMiles * numberOfRuns;
  mileages[mileages.length - 1] = Number(
    (baseMiles + totalMiles - assignedMiles).toFixed(1)
  );

  return mileages;
}

function getPlannedWorkouts(
  plan: TrainingPlan | null,
  currentDate: string,
  preferences: TrainingPlanPreferences
): PlannedWorkout[] {
  if (!plan) {
    return [];
  }

  // Convert weekly plan rows into dated workouts so the calendar can show the future.
  const startDate = new Date(`${currentDate}T00:00:00`);
  const weekStart = addDays(startDate, -startDate.getDay());
  const { workoutDay, runDays } = getWeeklyRunDays(preferences);

  return plan.weeks.flatMap((week) => {
    const currentWeekStart = addDays(weekStart, (week.week - 1) * 7);
    const longRunDate = getWeekdayDate(currentWeekStart, preferences.longRunDay);
    const workoutDate = getWeekdayDate(currentWeekStart, workoutDay);
    const nonLongRunMileage = Math.max(
      0,
      Number((week.targetMiles - week.longRunMiles).toFixed(1))
    );
    const hasQualityWorkout =
      Boolean(week.workoutFocus) &&
      week.phase !== "Race week" &&
      week.phase !== "Recovery";
    const qualityMiles = hasQualityWorkout
      ? Number(Math.min(week.targetMiles * 0.2, nonLongRunMileage).toFixed(1))
      : 0;
    const easyRunDays = runDays.filter(
      (day) =>
        day !== preferences.longRunDay &&
        (!hasQualityWorkout || day !== workoutDay)
    );
    const easyMileage = Number((nonLongRunMileage - qualityMiles).toFixed(1));
    const easyMileages = splitMileage(easyMileage, easyRunDays.length);
    const workouts: PlannedWorkout[] = [
      {
        date: formatDateForInput(longRunDate),
        title: `Week ${week.week} long run`,
        type: "Long run",
        miles: week.longRunMiles,
        week: week.week,
      },
    ];

    if (hasQualityWorkout) {
      workouts.push({
        date: formatDateForInput(workoutDate),
        title: week.workoutFocus,
        type: "Workout",
        miles: qualityMiles,
        week: week.week,
      });
    }

    easyRunDays.forEach((day, index) => {
      const isRecoveryRun =
        day === preferences.restDay ||
        getWeekdayIndex(day) ===
          (getWeekdayIndex(preferences.longRunDay) + 1) % 7;

      workouts.push({
        date: formatDateForInput(getWeekdayDate(currentWeekStart, day)),
        title: isRecoveryRun ? "Recovery run" : "Easy aerobic run",
        type: "Easy",
        miles: easyMileages[index],
        week: week.week,
      });
    });

    return workouts.filter((workout) => workout.miles > 0);
  });
}

function getCalendarDays(
  runs: Run[],
  plannedWorkouts: PlannedWorkout[],
  referenceDate: Date
) {
  // The calendar combines completed Strava runs and future planned workouts.
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateString = formatDateForInput(date);
    const dayRuns = runs.filter((run) => run.date === dateString);
    const dayPlannedWorkouts = plannedWorkouts.filter(
      (workout) => workout.date === dateString
    );

    return {
      date: dateString,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === referenceDate.getMonth(),
      runs: dayRuns,
      plannedWorkouts: dayPlannedWorkouts,
      miles: calculateTotalMiles(dayRuns),
      plannedMiles: dayPlannedWorkouts.reduce((sum, workout) => sum + workout.miles, 0),
    };
  });
}
function getCalendarMonthLabel(referenceDate: Date) {
  return referenceDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getShortDateLabel(date: string) {
  return date.slice(5).replace("-", "/");
}

function isTrainingPlanResponse(value: unknown): value is Omit<
  TrainingPlan,
  "heartRateMax" | "heartRateZones"
> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const plan = value as Omit<TrainingPlan, "heartRateMax" | "heartRateZones">;

  return (
    typeof plan.title === "string" &&
    typeof plan.overview === "string" &&
    ["Low", "Medium", "High"].includes(plan.confidence) &&
    (plan.whyThisPlan === undefined ||
      (Array.isArray(plan.whyThisPlan) &&
        plan.whyThisPlan.every((item) => typeof item === "string"))) &&
    Array.isArray(plan.heartRateGuidance) &&
    plan.heartRateGuidance.every((item) => typeof item === "string") &&
    Array.isArray(plan.assumptions) &&
    plan.assumptions.every((item) => typeof item === "string") &&
    Array.isArray(plan.weeks) &&
    plan.weeks.every(
      (week) =>
        typeof week.week === "number" &&
        typeof week.phase === "string" &&
        typeof week.targetMiles === "number" &&
        typeof week.longRunMiles === "number" &&
        typeof week.workoutFocus === "string" &&
        typeof week.easyRunGuidance === "string" &&
        typeof week.notes === "string" &&
        (week.locked === undefined || typeof week.locked === "boolean")
    )
  );
}

function isCoachInsightResponse(value: unknown): value is CoachInsight {
  if (!value || typeof value !== "object") {
    return false;
  }

  const insight = value as CoachInsight;

  return (
    typeof insight.headline === "string" &&
    typeof insight.whatChanged === "string" &&
    typeof insight.nextMove === "string" &&
    typeof insight.watchOut === "string"
  );
}

function isActivityInsightResponse(value: unknown): value is ActivityInsight {
  if (!value || typeof value !== "object") {
    return false;
  }

  const insight = value as ActivityInsight;

  return (
    typeof insight.headline === "string" &&
    typeof insight.summary === "string" &&
    typeof insight.effortAssessment === "string" &&
    Array.isArray(insight.positives) &&
    insight.positives.every((item) => typeof item === "string") &&
    Array.isArray(insight.watchOuts) &&
    insight.watchOuts.every((item) => typeof item === "string") &&
    typeof insight.nextStep === "string" &&
    Array.isArray(insight.dataLimitations) &&
    insight.dataLimitations.every((item) => typeof item === "string")
  );
}

function isStoredTrainingPlan(value: unknown): value is TrainingPlan {
  if (!isTrainingPlanResponse(value)) {
    return false;
  }

  const plan = value as TrainingPlan;

  return (
    (plan.heartRateMax === null || typeof plan.heartRateMax === "number") &&
    Array.isArray(plan.heartRateZones) &&
    plan.heartRateZones.every(
      (zone) =>
        typeof zone.name === "string" &&
        typeof zone.label === "string" &&
        typeof zone.range === "string" &&
        typeof zone.description === "string"
    )
  );
}

function getMostRecentRace(runs: Run[]) {
  return runs
    .filter((run) => run.isRace && run.elapsedTimeSeconds && run.raceDistance)
    .sort((firstRun, secondRun) => getRunTimeMs(secondRun) - getRunTimeMs(firstRun))[0];
}

function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatOptionalElapsedTime(totalSeconds?: number) {
  return totalSeconds ? formatElapsedTime(totalSeconds) : "Not available";
}

function formatOptionalHeartRate(heartRate?: number) {
  return heartRate ? `${Math.round(heartRate)} bpm` : "No HR data";
}

function formatOptionalCadence(cadence?: number) {
  return typeof cadence === "number" ? `${Math.round(cadence)} spm` : "Not available";
}

function getRunStressLabel(stress: number) {
  if (stress >= 14) {
    return "Heavy";
  }

  if (stress >= 8) {
    return "Moderate";
  }

  return "Light";
}

function getRunHeartRatePercent(run: Run, observedMaxHeartRate: number | null) {
  if (!run.averageHeartRate || !observedMaxHeartRate) {
    return "Not available";
  }

  return `${Math.round((run.averageHeartRate / observedMaxHeartRate) * 100)}% of max used`;
}

function App() {
// React state is the app's short-term memory. Calling a matching "set" function
// updates the value and causes React to redraw the affected screen.
const [goalRace, setGoalRace] = useState("Half Marathon");
const [pastRaceDistance, setPastRaceDistance] = useState("5K");
const [pastRaceTime, setPastRaceTime] = useState("00:00"); 
const [runs, setRuns] = useState<Run[]>(() => {
  // Keep an imported Strava history after refreshes. Sample runs are used only
  // when the user has never imported valid activity data in this browser.
  try {
    const storedRuns = JSON.parse(getStorage()?.getItem(SAVED_RUNS_KEY) ?? "null");

    return Array.isArray(storedRuns) && storedRuns.length > 0 && storedRuns.every(isRun)
      ? storedRuns
      : sampleRuns;
  } catch {
    return sampleRuns;
  }
});
const [showAllRuns, setShowAllRuns] = useState(false);
const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(() =>
  getStorage()?.getItem(SAVED_DISTANCE_UNIT_KEY) === "km" ? "km" : "mi"
);
const [actionMessage, setActionMessage] = useState("");
const [isImportingStrava, setIsImportingStrava] = useState(false);
const [isGeneratingTrainingPlan, setIsGeneratingTrainingPlan] = useState(false);
const [isPlanIntakeOpen, setIsPlanIntakeOpen] = useState(false);
const [pageView, setPageView] = useState<PageView>("dashboard");
const [dashboardView, setDashboardView] = useState<DashboardView>("overview");
const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(() => {
  // Load the last generated plan on startup when browser storage is available.
  try {
    const storage = getStorage();
    const storedPlan = storage?.getItem(SAVED_TRAINING_PLAN_KEY);

    if (!storedPlan) {
      return null;
    }

    const parsedPlan = JSON.parse(storedPlan);

    return isStoredTrainingPlan(parsedPlan) ? parsedPlan : null;
  } catch {
    return null;
  }
});
const [selectedRun, setSelectedRun] = useState<Run | null>(null);
const [planPreferences, setPlanPreferences] = useState<TrainingPlanPreferences>(() => {
  // Saved preferences are merged over defaults. This lets us safely add a new
  // preference later without breaking people who have older saved data.
  const defaultPreferences = {
    goalFocus: "Run a smart PR attempt",
    daysPerWeek: 5,
    longRunDay: "Sunday",
    restDay: "Monday",
    planStyle: "Balanced",
    injuryStatus: "No current injury",
    notes: "",
  };

  try {
    const storage = getStorage();
    const storedPreferences = storage?.getItem(SAVED_PLAN_PREFERENCES_KEY);

    if (!storedPreferences) {
      return defaultPreferences;
    }

    return {
      ...defaultPreferences,
      ...JSON.parse(storedPreferences),
    };
  } catch {
    return defaultPreferences;
  }
});
const importInputRef = useRef<HTMLInputElement | null>(null);
const summarySectionRef = useRef<HTMLElement | null>(null);

const [pastRaceDate, setPastRaceDate] = useState("2026-05-01");
const [goalRaceDate, setGoalRaceDate] = useState("2026-10-12");
const [calendarReferenceDate, setCalendarReferenceDate] = useState(() => new Date());
const [configuredMaxHeartRate, setConfiguredMaxHeartRate] = useState<number | null>(() => {
  const storedMaxHeartRate = Number(getStorage()?.getItem(SAVED_MAX_HEART_RATE_KEY));

  return storedMaxHeartRate >= 100 && storedMaxHeartRate <= 240
    ? storedMaxHeartRate
    : null;
});

const today = new Date();

const goalDate = new Date(goalRaceDate);
const currentDate = formatDateForInput(today);

// Dates are stored as real Date objects for math, but shown/sent as YYYY-MM-DD.
const weeksUntilGoalRace = Math.max(
  0,
  Math.ceil(
    (goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)
  )
);

function clearAiSummary() {
  // Old AI text becomes misleading after the underlying run data changes.
  setAiSummary(null);
}

function changeCalendarMonth(monthOffset: number) {
  setCalendarReferenceDate((currentMonth) => {
    return new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      1
    );
  });
}

/*
 * DERIVED DATA
 *
 * These values are calculated from state on every render. They do not need
 * their own state because React can always recreate them from `runs`.
 *
 * The 7-day window describes "right now." The 90-day window describes the
 * runner's real base and prevents one strange week from controlling the app.
 */
const trainingRuns = getWindowRuns(runs, TRAINING_WINDOW_DAYS);
const trendRuns = getWindowRuns(runs, TREND_WINDOW_DAYS);
const observedMaxHeartRate = getObservedMaxHeartRate(trendRuns);
const mostRecentRace = getMostRecentRace(runs);
const detectedRaceTime = mostRecentRace?.elapsedTimeSeconds
  ? formatElapsedTime(mostRecentRace.elapsedTimeSeconds)
  : null;
const effectivePastRaceDistance = mostRecentRace?.raceDistance ?? pastRaceDistance;
const effectivePastRaceTime = detectedRaceTime ?? pastRaceTime;
const effectivePastRaceDate = mostRecentRace?.date ?? pastRaceDate;
const raceDataSource = mostRecentRace ? "Strava race tag" : "Manual entry";
const isPastRaceTimeValid = convertRaceTimeToMinutes(effectivePastRaceTime) > 0;
const daysSincePastRace = getDaysBetweenDates(effectivePastRaceDate, today);
const weeksSincePastRace = Math.max(0, Math.round(daysSincePastRace / 7));

const totalMiles = calculateTotalMiles(trainingRuns);
const longestRun = calculateLongestRun(trainingRuns);
const numberOfRuns = calculateNumberOfRuns(trainingRuns);
const fitnessScore = calculateFitnessScore(trainingRuns);
const trendLongestRun = calculateLongestRun(trendRuns);
const trendNumberOfRuns = calculateNumberOfRuns(trendRuns);
const trendAverageWeeklyMiles = getAverageWeeklyMiles(trendRuns, TREND_WINDOW_DAYS);
const trendAverageWeeklyRuns = trendNumberOfRuns / (TREND_WINDOW_DAYS / 7);
const planTrendRuns = trendRuns.filter((run) => !run.isRace);
// Race efforts prove fitness, but including a marathon as a normal training run
// would exaggerate the weekly baseline used to build the training plan.
const planSourceRuns = planTrendRuns.length > 0 ? planTrendRuns : trendRuns;
const planTrendLongestRun = calculateLongestRun(planSourceRuns);
const recentPlanRuns = getWindowRuns(planSourceRuns, RECENT_BASELINE_WINDOW_DAYS);
const recentAverageWeeklyMiles = getAverageWeeklyMiles(
  recentPlanRuns,
  RECENT_BASELINE_WINDOW_DAYS
);
// Use the stronger sustained baseline so one quiet week does not reset the plan.
const planBaselineWeeklyMiles = Math.max(
  trendAverageWeeklyMiles,
  recentAverageWeeklyMiles
);
const fitnessTimeline = calculateTrainingLoadTimeline(trendRuns, 8);
const plannedWorkouts = getPlannedWorkouts(trainingPlan, currentDate, planPreferences);
const calendarDays = getCalendarDays(runs, plannedWorkouts, calendarReferenceDate);
const calendarMonthLabel = getCalendarMonthLabel(calendarReferenceDate);
// A known max HR is more accurate than simply using the highest recent Strava reading.
const effectiveMaxHeartRate = configuredMaxHeartRate ?? observedMaxHeartRate;
const heartRateZones = createHeartRateZones(effectiveMaxHeartRate);
const maxChartLoad = Math.max(
  1,
  ...fitnessTimeline.flatMap((point) => [point.acuteLoad, point.chronicLoad])
);
const chartScaleMax = Math.ceil(maxChartLoad / 10) * 10;
const maxAbsoluteForm = Math.max(
  1,
  ...fitnessTimeline.map((point) => Math.abs(point.form))
);

const racePredictions = isPastRaceTimeValid
  ? calculateRacePredictionsFromHistory(
      trendRuns,
      effectivePastRaceDistance,
      effectivePastRaceTime,
      weeksUntilGoalRace
    )
  : null;
const currentRaceCapabilities = isPastRaceTimeValid
  ? calculateCurrentRaceCapabilities(
      runs,
      effectivePastRaceDistance,
      effectivePastRaceTime
    )
  : null;

const fitnessBreakdown = calculateFitnessBreakdown(trainingRuns);
const trainingLoad = calculateTrainingLoad(trainingRuns);
const trainingLoadMetrics = calculateTrainingLoadMetrics(trendRuns);

const selectedGoalTime = currentRaceCapabilities
  // Pick the prediction that matches the race selected by the user.
  ? goalRace === "5K"
    ? currentRaceCapabilities.fiveK
    : goalRace === "10K"
    ? currentRaceCapabilities.tenK
    : goalRace === "Half Marathon"
    ? currentRaceCapabilities.halfMarathon
    : currentRaceCapabilities.marathon
  : "Enter a valid time";
const paceZones = createPaceZones(goalRace, selectedGoalTime, distanceUnit);
const distanceMultiplier = distanceUnit === "km" ? KILOMETERS_PER_MILE : 1;
const formatDistanceValue = (miles: number) =>
  Number((miles * distanceMultiplier).toFixed(2)).toString();
const formatDistance = (miles: number) =>
  `${formatDistanceValue(miles)} ${distanceUnit}`;
const formatWeeklyDistance = (miles: number) =>
  `${formatDistanceValue(miles)} ${distanceUnit}/wk`;
const convertDisplayedDistanceToMiles = (distance: number) =>
  distanceUnit === "km" ? distance / KILOMETERS_PER_MILE : distance;
const formatRunPace = (pace: string) => {
  if (distanceUnit === "mi" || !pace.includes("/mi")) {
    return pace;
  }

  const match = pace.match(/(\d+):(\d{2})\s*\/mi/);

  if (!match) {
    return pace;
  }

  const minutesPerMile = Number(match[1]) + Number(match[2]) / 60;

  return pace.replace(match[0], formatPaceFromMinutes(minutesPerMile, "km"));
};
const formatElevation = (feet?: number) => {
  if (typeof feet !== "number") {
    return "Not available";
  }

  return distanceUnit === "km"
    ? `${Math.round(feet * 0.3048)} m`
    : `${Math.round(feet)} ft`;
};
const unitToggle = (
  <div className="unitToggle" aria-label="Distance unit">
    {(["mi", "km"] as DistanceUnit[]).map((unit) => (
      <button
        className={distanceUnit === unit ? "activeUnit" : ""}
        key={unit}
        type="button"
        onClick={() => setDistanceUnit(unit)}
      >
        {unit === "mi" ? "Miles" : "Kilometers"}
      </button>
    ))}
  </div>
);

  const [aiSummary, setAiSummary] = useState<null | {
  headline: string;
  summary: string;
  aiAdjustedGoalTime: string;
  confidence: string;
  dateAssessment: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
}>(null);

const [isLoadingCoach, setIsLoadingCoach] = useState(false);
const [isLoadingAI, setIsLoadingAI] = useState(false);
const [coachInsight, setCoachInsight] = useState<CoachInsight | null>(null);
const [activityInsights, setActivityInsights] = useState<Record<string, ActivityInsight>>({});
const [isLoadingActivityInsight, setIsLoadingActivityInsight] = useState(false);
const visibleRuns = showAllRuns ? runs : runs.slice(0, RECENT_RUN_LIMIT);

useEffect(() => {
  getStorage()?.setItem(SAVED_DISTANCE_UNIT_KEY, distanceUnit);
  setAiSummary(null);
}, [distanceUnit]);

useEffect(() => {
  // Imported runs drive every fitness and plan calculation, so they must
  // survive a page refresh just like the generated training plan does.
  getStorage()?.setItem(SAVED_RUNS_KEY, JSON.stringify(runs));
}, [runs]);

useEffect(() => {
  // useEffect runs after React renders. This effect watches `trainingPlan` and
  // copies each change into browser storage.
  // Persist plan edits, locks, and generated weeks so refreshes do not wipe progress.
  const storage = getStorage();

  if (!storage) {
    return;
  }

  if (trainingPlan) {
    storage.setItem(SAVED_TRAINING_PLAN_KEY, JSON.stringify(trainingPlan));
    return;
  }

  storage.removeItem(SAVED_TRAINING_PLAN_KEY);
}, [trainingPlan]);

useEffect(() => {
  // This separate effect saves the questionnaire answers whenever they change.
  const storage = getStorage();

  if (storage) {
    storage.setItem(
      SAVED_PLAN_PREFERENCES_KEY,
      JSON.stringify(planPreferences)
    );
  }
}, [planPreferences]);

useEffect(() => {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  if (configuredMaxHeartRate) {
    storage.setItem(SAVED_MAX_HEART_RATE_KEY, String(configuredMaxHeartRate));
    return;
  }

  storage.removeItem(SAVED_MAX_HEART_RATE_KEY);
}, [configuredMaxHeartRate]);

function handleAnalyzeFitness() {
  setPageView("dashboard");
  setDashboardView("coach");
  setTimeout(() => {
    summarySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
  setActionMessage("Jumped to your coaching summary.");
}

function handleSelectRun(run: Run) {
  setSelectedRun(run);
  setPageView("activityDetail");
  setActionMessage("");
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Generate once per activity, then reuse the cached result when revisiting it.
  if (!activityInsights[getActivityInsightKey(run)]) {
    void handleGenerateActivityInsight(run);
  }
}

function getActivityInsightKey(run: Run) {
  return String(run.stravaActivityId ?? `${run.date}-${run.type}-${run.distanceMiles}`);
}

async function handleGenerateActivityInsight(run: Run) {
  const runStress = Number(calculateRunTrainingStress(run).toFixed(1));

  setIsLoadingActivityInsight(true);

  try {
    const response = await fetch(ACTIVITY_INSIGHT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run,
        maxHeartRateUsed: effectiveMaxHeartRate,
        heartRateZones,
        paceZones,
        activityLoad: runStress,
        activityLoadLabel: getRunStressLabel(runStress),
        trainingLoadMetrics,
        trendAverageWeeklyMiles,
        goalRace,
        selectedGoalTime,
      }),
    });
    const data = await response.json();

    if (!response.ok || !isActivityInsightResponse(data)) {
      throw new Error(data.summary || "Could not analyze this activity.");
    }

    setActivityInsights((current) => ({
      ...current,
      [getActivityInsightKey(run)]: data,
    }));
  } catch (error) {
    console.error(error);
    setActionMessage(
      error instanceof Error ? error.message : "Could not analyze this activity."
    );
  } finally {
    setIsLoadingActivityInsight(false);
  }
}

function handleImportDataClick() {
  importInputRef.current?.click();
}

async function handleImportStravaRuns() {
  // Frontend API pattern:
  // 1. Show a loading state.
  // 2. Ask the backend for data.
  // 3. Validate the response.
  // 4. Put valid data into React state.
  // 5. Always turn loading off in `finally`.
  setIsImportingStrava(true);
  setActionMessage("Importing runs from Strava...");

  try {
    const response = await fetch(`${STRAVA_RUNS_URL}?per_page=100`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not import Strava runs.");
    }

    if (!Array.isArray(data.runs) || !data.runs.every(isRun)) {
      throw new Error("The Strava response did not match the app's run format.");
    }

    setRuns(data.runs);
    setSelectedRun(null);
    setCoachInsight(null);
    setShowAllRuns(data.runs.length <= RECENT_RUN_LIMIT);
    const importedRace = getMostRecentRace(data.runs);

    clearAiSummary();
    setActionMessage(
      importedRace
        ? `Imported ${data.runs.length} runs from Strava and detected ${importedRace.type} from its race tag.`
        : `Imported ${data.runs.length} runs from Strava. No race-tagged activity was found.`
    );
  } catch (error) {
    console.error(error);
    setActionMessage(
      error instanceof Error
        ? error.message
        : "Could not import Strava runs."
    );
  } finally {
    setIsImportingStrava(false);
  }
}

async function handleImportRuns(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed) || !parsed.every(isRun)) {
      throw new Error("Imported file must be a JSON array of runs.");
    }

    setRuns(parsed);
    setSelectedRun(null);
    setCoachInsight(null);
    setShowAllRuns(parsed.length <= RECENT_RUN_LIMIT);
    clearAiSummary();
    setActionMessage(`Imported ${parsed.length} runs from ${file.name}.`);
  } catch (error) {
    console.error(error);
    setActionMessage("Import failed. Use a JSON file with date, type, distanceMiles, pace, and effort.");
  } finally {
    event.target.value = "";
  }
}

function handleResetSampleData() {
  setRuns(sampleRuns);
  setSelectedRun(null);
  setCoachInsight(null);
  setShowAllRuns(false);
  clearAiSummary();
  setActionMessage("Sample run data restored.");
}

function handleExportReport() {
  // A Blob is an in-memory file. The temporary link tells the browser to
  // download that file without needing another backend route.
  const report = {
    generatedAt: new Date().toISOString(),
    currentDate,
    goalRace,
    raceDataSource,
    pastRaceDistance: effectivePastRaceDistance,
    pastRaceTime: effectivePastRaceTime,
    pastRaceDate: effectivePastRaceDate,
    daysSincePastRace,
    weeksSincePastRace,
    goalRaceDate,
    weeksUntilGoalRace,
    stats: {
      trainingWindowDays: TRAINING_WINDOW_DAYS,
      trendWindowDays: TREND_WINDOW_DAYS,
      totalMiles,
      longestRun,
      numberOfRuns,
      fitnessScore,
      trainingLoad,
      trainingLoadMetrics,
      fitnessBreakdown,
    },
    racePredictions,
    mostRecentRace,
    aiSummary,
    trainingRuns,
    trendRuns,
    runs,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "race-readiness-report.json";
  link.click();
  URL.revokeObjectURL(url);
  setActionMessage("Exported race-readiness-report.json.");
}

async function handleGenerateTrainingPlan() {
  // Only non-race trend runs are sent as the normal training baseline.
  // Locked weeks are also sent so a regeneration can respect manual edits.
  const lockedWeeks = trainingPlan?.weeks.filter((week) => week.locked) ?? [];

  setIsGeneratingTrainingPlan(true);
  setActionMessage("Generating your AI training plan...");

  try {
    const response = await fetch(TRAINING_PLAN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        goalRace,
        goalRaceDate,
        currentDate,
        weeksUntilGoalRace,
        trendAverageWeeklyMiles,
        recentAverageWeeklyMiles,
        planBaselineWeeklyMiles,
        trendLongestRun: planTrendLongestRun,
        trendNumberOfRuns,
        selectedGoalTime,
        raceDataSource,
        mostRecentRace,
        observedMaxHeartRate: effectiveMaxHeartRate,
        trendRuns: planSourceRuns,
        planPreferences,
        lockedWeeks,
      }),
    });
    const data = await response.json();

    if (!response.ok || !isTrainingPlanResponse(data)) {
      throw new Error(data.overview || "Could not generate a training plan.");
    }

    // If the user locked weeks locally, keep those edits after the AI returns a new plan.
    setTrainingPlan({
      ...data,
      heartRateMax: effectiveMaxHeartRate,
      heartRateZones: createHeartRateZones(effectiveMaxHeartRate),
      weeks: data.weeks.map((week) => {
        const lockedWeek = lockedWeeks.find(
          (candidate) => candidate.week === week.week
        );

        return lockedWeek ?? week;
      }),
    });
    setIsPlanIntakeOpen(false);
    setPageView("trainingPlan");
    setActionMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    setActionMessage(
      error instanceof Error
        ? error.message
        : "Could not generate a training plan."
    );
  } finally {
    setIsGeneratingTrainingPlan(false);
  }
}

function handleOpenPlanIntake() {
  setIsPlanIntakeOpen(true);
  setActionMessage("");
}

function handleUpdatePlanWeek(
  weekNumber: number,
  updates: Partial<PlanWeek>
) {
  // Editing a week automatically locks it so regeneration does not casually overwrite it.
  setTrainingPlan((currentPlan) => {
    if (!currentPlan) {
      return currentPlan;
    }

    return {
      ...currentPlan,
      weeks: currentPlan.weeks.map((week) =>
        week.week === weekNumber ? { ...week, ...updates, locked: true } : week
      ),
    };
  });
}

function handleTogglePlanWeekLock(weekNumber: number) {
  setTrainingPlan((currentPlan) => {
    if (!currentPlan) {
      return currentPlan;
    }

    return {
      ...currentPlan,
      weeks: currentPlan.weeks.map((week) =>
        week.week === weekNumber ? { ...week, locked: !week.locked } : week
      ),
    };
  });
}

function handleClearTrainingPlan() {
  setTrainingPlan(null);
  setPageView("dashboard");
  setActionMessage("Saved training plan cleared.");
}

async function handleRefreshAISummary() {
  // The backend receives facts and calculations, then asks the AI to explain
  // them. Sending the facts explicitly reduces made-up AI conclusions.
  setIsLoadingAI(true);
  setActionMessage("Refreshing AI fitness summary...");

  try {
    const response = await fetch(AI_SUMMARY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        totalMiles,
        longestRun,
        numberOfRuns,
        fitnessScore,
        trainingLoad,
        trainingStatus: trainingLoadMetrics.status,
        displayUnit: distanceUnit,
        trendWindowDays: TREND_WINDOW_DAYS,
        trendTotalMiles: calculateTotalMiles(trendRuns),
        trendLongestRun: planTrendLongestRun,
        trendNumberOfRuns,
        trendAverageWeeklyMiles,
        trendAverageWeeklyRuns,
        goalRace,
        selectedGoalTime,
        pastRaceDistance: effectivePastRaceDistance,
        pastRaceTime: effectivePastRaceTime,
        pastRaceDate: effectivePastRaceDate,
        raceDataSource,
        currentDate,
        daysSincePastRace,
        weeksSincePastRace,
        goalRaceDate,
        weeksUntilGoalRace,
        trainingWindowDays: TRAINING_WINDOW_DAYS,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.summary || "Could not refresh AI summary.");
    }

    setAiSummary(data);
    setActionMessage("AI fitness summary refreshed from current Strava data.");
  } catch (error) {
    console.error(error);
    setActionMessage(
      error instanceof Error
        ? error.message
        : "Could not refresh AI fitness summary."
    );
  } finally {
    setIsLoadingAI(false);
  }
}

async function handleGenerateCoachCheckIn() {
  setIsLoadingCoach(true);
  setActionMessage("Generating coach check-in...");

  try {
    const response = await fetch(COACH_CHECK_IN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentDate,
        goalRace,
        goalRaceDate,
        weeksUntilGoalRace,
        selectedGoalTime,
        trainingLoadMetrics,
        trendAverageWeeklyMiles,
        trendLongestRun,
        trendNumberOfRuns,
        recentRuns: runs.slice(0, 12),
        fitnessTimeline,
        heartRateZones,
        paceZones,
      }),
    });
    const data = await response.json();

    if (!response.ok || !isCoachInsightResponse(data)) {
      throw new Error(data.headline || "Could not generate coach check-in.");
    }

    setCoachInsight(data);
    setActionMessage("");
  } catch (error) {
    console.error(error);
    setCoachInsight({
      headline: "Coach check-in is unavailable right now.",
      whatChanged: "The app could not call the AI coach endpoint.",
      nextMove: "Use the training load and recent run data as your guide for now.",
      watchOut:
        error instanceof Error
          ? error.message
          : "Something went wrong while generating the coach check-in.",
    });
    setActionMessage("");
  } finally {
    setIsLoadingCoach(false);
  }
}

const planIntakeModal = isPlanIntakeOpen ? (
  <div className="modalBackdrop" role="presentation">
    <section
      className="planIntakeModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-intake-title"
    >
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Training Plan Setup</p>
          <h2 id="plan-intake-title">Tell the coach what you want</h2>
          <p>
            The plan will use your Strava history as the base, then shape the
            weeks around these answers.
          </p>
        </div>

        <button
          className="smallButton"
          type="button"
          onClick={() => setIsPlanIntakeOpen(false)}
          disabled={isGeneratingTrainingPlan}
        >
          Close
        </button>
      </div>

      <div className="planRaceGrid">
        <label>
          Goal race
          <select
            value={goalRace}
            onChange={(event) => {
              setGoalRace(event.target.value);
              clearAiSummary();
            }}
          >
            <option value="5K">5K</option>
            <option value="10K">10K</option>
            <option value="Half Marathon">Half Marathon</option>
            <option value="Marathon">Marathon</option>
          </select>
        </label>

        <label>
          Goal race date
          <input
            type="date"
            value={goalRaceDate}
            onChange={(event) => {
              setGoalRaceDate(event.target.value);
              clearAiSummary();
            }}
          />
        </label>

        {mostRecentRace ? (
          <div className="planDetectedRace">
            <span>Most recent race tag</span>
            <strong>{effectivePastRaceDistance} - {effectivePastRaceTime}</strong>
            <p>{mostRecentRace.type} on {effectivePastRaceDate}</p>
          </div>
        ) : (
          <>
            <label>
              Past race distance
              <select
                value={pastRaceDistance}
                onChange={(event) => {
                  setPastRaceDistance(event.target.value);
                  clearAiSummary();
                }}
              >
                <option value="5K">5K</option>
                <option value="10K">10K</option>
                <option value="Half Marathon">Half Marathon</option>
                <option value="Marathon">Marathon</option>
              </select>
            </label>

            <label>
              Past race time
              <input
                value={pastRaceTime}
                onChange={(event) => {
                  setPastRaceTime(event.target.value);
                  clearAiSummary();
                }}
                placeholder="22:30 or 1:43:20"
              />
            </label>

            <label>
              Past race date
              <input
                type="date"
                value={pastRaceDate}
                onChange={(event) => {
                  setPastRaceDate(event.target.value);
                  clearAiSummary();
                }}
              />
            </label>
          </>
        )}
      </div>

      <div className="planIntakeGrid">
        <label>
          Main goal
          <select
            value={planPreferences.goalFocus}
            onChange={(event) =>
              setPlanPreferences((current) => ({
                ...current,
                goalFocus: event.target.value,
              }))
            }
          >
            <option>Run a smart PR attempt</option>
            <option>Finish strong and healthy</option>
            <option>Build fitness without chasing a time</option>
            <option>Return carefully after a break</option>
          </select>
        </label>

        <label>
          Runs per week
          <select
            value={planPreferences.daysPerWeek}
            onChange={(event) =>
              setPlanPreferences((current) => ({
                ...current,
                daysPerWeek: Number(event.target.value),
              }))
            }
          >
            {[3, 4, 5, 6, 7].map((dayCount) => (
              <option key={dayCount} value={dayCount}>
                {dayCount}
              </option>
            ))}
          </select>
        </label>

        <label>
          Long run day
          <select
            value={planPreferences.longRunDay}
            onChange={(event) =>
              setPlanPreferences((current) => ({
                ...current,
                longRunDay: event.target.value,
              }))
            }
          >
            {["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
              <option key={day}>{day}</option>
            ))}
          </select>
        </label>

        <label>
          Preferred rest day
          <select
            value={planPreferences.restDay}
            onChange={(event) =>
              setPlanPreferences((current) => ({
                ...current,
                restDay: event.target.value,
              }))
            }
          >
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
              <option key={day}>{day}</option>
            ))}
          </select>
        </label>

        <label>
          Plan style
          <select
            value={planPreferences.planStyle}
            onChange={(event) =>
              setPlanPreferences((current) => ({
                ...current,
                planStyle: event.target.value,
              }))
            }
          >
            <option>Balanced</option>
            <option>Conservative</option>
            <option>Aggressive but sensible</option>
            <option>Low intensity / high consistency</option>
          </select>
        </label>

        <label>
          Injury or limitation
          <select
            value={planPreferences.injuryStatus}
            onChange={(event) =>
              setPlanPreferences((current) => ({
                ...current,
                injuryStatus: event.target.value,
              }))
            }
          >
            <option>No current injury</option>
            <option>Minor niggle, be cautious</option>
            <option>Returning from injury</option>
            <option>Very fatigue-sensitive right now</option>
          </select>
        </label>

        <label className="planNotesField">
          Anything else?
          <textarea
            value={planPreferences.notes}
            onChange={(event) =>
              setPlanPreferences((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Example: I prefer workouts on Tuesdays, no doubles, travel in week 3..."
          />
        </label>
      </div>

      <div className="planIntakeSummary">
        <p>
          Strava base: {formatWeeklyDistance(trendAverageWeeklyMiles)} over 90
          days and {formatWeeklyDistance(recentAverageWeeklyMiles)} over the latest
          6 weeks. Plan baseline: {formatWeeklyDistance(planBaselineWeeklyMiles)},
          longest non-race run {formatDistance(planTrendLongestRun)},{" "}
          {trendNumberOfRuns} recent activities.
        </p>
      </div>

      <div className="modalActions">
        <button
          className="secondaryButton"
          type="button"
          onClick={() => setIsPlanIntakeOpen(false)}
          disabled={isGeneratingTrainingPlan}
        >
          Cancel
        </button>

        <button
          className="planButton"
          type="button"
          onClick={handleGenerateTrainingPlan}
          disabled={isGeneratingTrainingPlan}
        >
          {isGeneratingTrainingPlan ? "Building..." : "Build My Plan"}
        </button>
      </div>
    </section>
  </div>
) : null;

  const aiCoachSummary = generateAICoachSummary({
  totalMiles,
  longestRun,
  numberOfRuns,
  fitnessScore,
  trainingStatus: trainingLoadMetrics.status,
  trendAverageWeeklyMiles,
  trendLongestRun: planTrendLongestRun,
  trendAverageWeeklyRuns,
  goalRace,
  selectedGoalTime,
  distanceUnit,
});

  if (pageView === "activityDetail" && selectedRun) {
    const runStress = Number(calculateRunTrainingStress(selectedRun).toFixed(1));
    const stressLabel = getRunStressLabel(runStress);
    const activityInsight = activityInsights[getActivityInsightKey(selectedRun)];

    return (
      <main className="app">
        <header className="topBar">
          <div>
            <p className="eyebrow">Activity Detail</p>
            <h1>{selectedRun.type}</h1>
          </div>

          <div className="topBarActions">
            {unitToggle}
            <div className="buttonRow">
              <button
                className="secondaryButton"
                onClick={() => setPageView("dashboard")}
              >
                Back to Dashboard
              </button>
              <button
                className="secondaryButton"
                onClick={handleClearTrainingPlan}
              >
                Clear Saved Plan
              </button>
            </div>
          </div>
        </header>

        <section className="activityHero">
          <div>
            <p className="eyebrow">{selectedRun.date}</p>
            <h2>{formatDistance(selectedRun.distanceMiles)}</h2>
            <p className="bodyText">
              This activity is labeled <strong>{selectedRun.effort}</strong>
              {selectedRun.isRace ? " and came from a Strava race tag." : "."}
            </p>
          </div>

          <div className="activityPillStack">
            {selectedRun.isRace && <span className="pill racePill">Race</span>}
            <span className="pill">{selectedRun.effort}</span>
            <span className="pill">{stressLabel} load</span>
          </div>
        </section>

        <section className="card activityAiCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">AI Activity Analysis</p>
              <h2>
                {activityInsight?.headline ??
                  (isLoadingActivityInsight ? "Analyzing this run..." : "Understand this run")}
              </h2>
              <p>
                Analyzes pace, heart rate and zones, elevation, cadence, weather
                when available, and your wider training context.
              </p>
            </div>
          </div>

          {activityInsight ? (
            <>
              <p className="activityAiSummary">{activityInsight.summary}</p>
              <div className="activityAiGrid">
                <div>
                  <span>Effort assessment</span>
                  <p>{activityInsight.effortAssessment}</p>
                </div>
                <div>
                  <span>Next step</span>
                  <p>{activityInsight.nextStep}</p>
                </div>
                <div>
                  <span>Positives</span>
                  <ul>
                    {activityInsight.positives.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <span>Watch-outs</span>
                  <ul>
                    {activityInsight.watchOuts.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
              {activityInsight.dataLimitations.length > 0 && (
                <div className="activityAiLimitations">
                  <strong>Data limitations</strong>
                  <p>{activityInsight.dataLimitations.join(" ")}</p>
                </div>
              )}
            </>
          ) : (
            <p className="coachEmpty">
              {isLoadingActivityInsight
                ? "Using this activity's training data to build your summary..."
                : "Click this activity again to retry its analysis."}
            </p>
          )}
        </section>

        <section className="activityGrid">
          <div className="card activityMetricCard">
            <p className="cardLabel">Core Stats</p>
            <div className="activityMetricList">
              <div>
                <span>Distance</span>
                <strong>{formatDistance(selectedRun.distanceMiles)}</strong>
              </div>
              <div>
                <span>Pace</span>
                <strong>{formatRunPace(selectedRun.pace)}</strong>
              </div>
              <div>
                <span>Elapsed Time</span>
                <strong>{formatOptionalElapsedTime(selectedRun.elapsedTimeSeconds)}</strong>
              </div>
              <div>
                <span>Moving Time</span>
                <strong>{formatOptionalElapsedTime(selectedRun.movingTimeSeconds)}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{selectedRun.source ?? "Manual"}</strong>
              </div>
            </div>
          </div>

          <div className="card activityMetricCard">
            <p className="cardLabel">Heart Rate</p>
            <div className="activityMetricList">
              <div>
                <span>Average HR</span>
                <strong>{formatOptionalHeartRate(selectedRun.averageHeartRate)}</strong>
              </div>
              <div>
                <span>Max HR</span>
                <strong>{formatOptionalHeartRate(selectedRun.maxHeartRate)}</strong>
              </div>
              <div>
                <span>Relative Effort</span>
                <strong>{getRunHeartRatePercent(selectedRun, effectiveMaxHeartRate)}</strong>
              </div>
              <div>
                <span>Max Used for Zones</span>
                <strong>{effectiveMaxHeartRate ? `${effectiveMaxHeartRate} bpm` : "No HR data"}</strong>
              </div>
              <div>
                <span>Observed Max</span>
                <strong>{observedMaxHeartRate ? `${observedMaxHeartRate} bpm` : "No HR data"}</strong>
              </div>
            </div>
          </div>

          <div className="card activityMetricCard">
            <p className="cardLabel">Strava Details</p>
            <div className="activityMetricList">
              <div>
                <span>Elevation Gain</span>
                <strong>{formatElevation(selectedRun.elevationGainFeet)}</strong>
              </div>
              <div>
                <span>Avg Cadence</span>
                <strong>{formatOptionalCadence(selectedRun.averageCadence)}</strong>
              </div>
              <div>
                <span>Activity ID</span>
                <strong>{selectedRun.stravaActivityId ?? "Not available"}</strong>
              </div>
              <div>
                <span>Workout Type</span>
                <strong>{selectedRun.stravaWorkoutType ?? "Not available"}</strong>
              </div>
              <div>
                <span>Weather</span>
                <strong>{selectedRun.weatherSummary ?? "Not available"}</strong>
              </div>
            </div>
          </div>

          <div className="card activityMetricCard activityWideCard">
            <p className="cardLabel">Training Load</p>
            <div className="activityLoadSummary">
              <strong>{runStress}</strong>
              <div>
                <h2>{stressLabel} activity load</h2>
                <p>
                  This score uses distance, the effort label, and heart rate
                  when available. It is a simple estimate, not a lab-grade
                  training stress score.
                </p>
              </div>
            </div>
          </div>

          <div className="card activityMetricCard activityWideCard">
            <p className="cardLabel">Activity Flags</p>
            <div className="activityTagGrid">
              <div>
                <span>Race tagged</span>
                <strong>{selectedRun.isRace ? "Yes" : "No"}</strong>
              </div>
              <div>
                <span>Race distance</span>
                <strong>{selectedRun.raceDistance ?? "Not a race"}</strong>
              </div>
              <div>
                <span>Strava workout type</span>
                <strong>{selectedRun.stravaWorkoutType ?? "Not available"}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (pageView === "trainingPlan" && trainingPlan) {
    return (
      <main className="app">
        <header className="topBar">
          <div>
            <p className="eyebrow">Training Plan</p>
            <h1>{trainingPlan.title}</h1>
          </div>

          <div className="topBarActions">
            {unitToggle}
            <div className="buttonRow">
              <button
                className="secondaryButton"
                onClick={() => setPageView("dashboard")}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </header>

        {planIntakeModal}

        <section className="card planGoalCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Goal Race</p>
              <h2>{goalRace}</h2>
              <p>
                The training plan is built from this race goal, your race-tagged
                Strava result, your goal date, and your plan setup answers.
              </p>
            </div>

            <div className="buttonRow">
              <button
                className="planButton"
                onClick={handleOpenPlanIntake}
                disabled={isGeneratingTrainingPlan}
              >
                {isGeneratingTrainingPlan ? "Generating..." : "Update Goal & Plan"}
              </button>
            </div>
          </div>

          <div className="planGoalGrid">
            <div>
              <span>Goal Date</span>
              <strong>{goalRaceDate}</strong>
            </div>
            <div>
              <span>Time Estimate</span>
              <strong>{selectedGoalTime}</strong>
            </div>
            <div>
              <span>Weeks Away</span>
              <strong>{weeksUntilGoalRace}</strong>
            </div>
            <div>
              <span>Race Data</span>
              <strong>{raceDataSource}</strong>
            </div>
            <div>
              <span>Main Goal</span>
              <strong>{planPreferences.goalFocus}</strong>
            </div>
            <div>
              <span>Runs / Week</span>
              <strong>{planPreferences.daysPerWeek}</strong>
            </div>
            <div>
              <span>Long Run</span>
              <strong>{planPreferences.longRunDay}</strong>
            </div>
            <div>
              <span>Rest Day</span>
              <strong>{planPreferences.restDay}</strong>
            </div>
          </div>
        </section>

        <section className="planHero">
          <div>
            <p className="eyebrow">Plan Basis</p>
            <h2>AI-built from Strava trends and HR signals</h2>
            <p className="bodyText">{trainingPlan.overview}</p>
          </div>

          <div className="planMetricGrid">
            <StatCard title="Weeks" value={`${trainingPlan.weeks.length}`} />
            <StatCard title="90-Day Avg" value={formatWeeklyDistance(trendAverageWeeklyMiles)} />
            <StatCard title="AI Confidence" value={trainingPlan.confidence} />
            <StatCard
              title="Max HR Used"
              value={effectiveMaxHeartRate ? `${effectiveMaxHeartRate} bpm` : "No HR"}
            />
          </div>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <div>
              <h2>Heart Rate Guidance</h2>
              <p>
                These are guidance ranges from your configured or observed max HR,
                not exact time-in-zone totals.
              </p>
            </div>
          </div>

          <div className="zoneGrid">
            {heartRateZones.map((zone) => (
              <div className="zoneBox" key={zone.name}>
                <span>{zone.name}</span>
                <strong>{zone.range}</strong>
                <p>{zone.label}</p>
                <small>{zone.description}</small>
              </div>
            ))}
          </div>

          <ul className="planAssumptions planGuidanceList">
            {trainingPlan.heartRateGuidance.map((guidance) => (
              <li key={guidance}>{guidance}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Plan Method</p>
              <h2>80/20-style, consistently structured</h2>
              <p>
                The schedule follows your selected {planPreferences.daysPerWeek}-run
                week: most running stays easy, with a small amount of purposeful
                faster work.
              </p>
            </div>
          </div>

          <div className="planMethodGrid">
            <div>
              <strong>Mostly easy</strong>
              <p>About 80% of training should feel conversational and controlled.</p>
            </div>
            <div>
              <strong>Limited quality work</strong>
              <p>Three to five run weeks use one main workout; higher-frequency plans may use two.</p>
            </div>
            <div>
              <strong>Weekly long run</strong>
              <p>The {planPreferences.longRunDay} long run builds endurance for {goalRace}.</p>
            </div>
            <div>
              <strong>Protected recovery</strong>
              <p>{planPreferences.restDay} remains the preferred rest day unless seven runs are selected.</p>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <div>
              <h2>Weekly Training Schedule</h2>
              <p>Each week contains the selected number of runs with distance distributed across the week.</p>
            </div>
          </div>

          <div className="planWeekList">
            {trainingPlan.weeks.map((week) => (
              <article className="planWeek" key={week.week}>
                <div className="planWeekHeader">
                  <div>
                    <p className="cardLabel">Week {week.week}</p>
                    <h3>{week.phase}</h3>
                  </div>
                  <button
                    className={week.locked ? "lockButton locked" : "lockButton"}
                    type="button"
                    onClick={() => handleTogglePlanWeekLock(week.week)}
                  >
                    {week.locked ? "Locked" : "Lock"}
                  </button>
                </div>

                <div className="planWeekStats">
                  <div>
                    <span>Weekly distance ({distanceUnit})</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={formatDistanceValue(week.targetMiles)}
                      onChange={(event) =>
                        handleUpdatePlanWeek(week.week, {
                          targetMiles: convertDisplayedDistanceToMiles(Number(event.target.value)),
                        })
                      }
                    />
                  </div>

                  <div>
                    <span>Long run ({distanceUnit})</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={formatDistanceValue(week.longRunMiles)}
                      onChange={(event) =>
                        handleUpdatePlanWeek(week.week, {
                          longRunMiles: convertDisplayedDistanceToMiles(Number(event.target.value)),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="planDailySchedule">
                  {plannedWorkouts
                    .filter((workout) => workout.week === week.week)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((workout) => (
                      <div key={`${workout.date}-${workout.title}`}>
                        <span>
                          {new Date(`${workout.date}T00:00:00`).toLocaleDateString("en-US", {
                            weekday: "short",
                          })}
                        </span>
                        <strong>{workout.title}</strong>
                        <em>{formatDistance(workout.miles)}</em>
                      </div>
                    ))}
                </div>

                <label className="planWeekField">
                  Workout
                  <textarea
                    value={week.workoutFocus}
                    onChange={(event) =>
                      handleUpdatePlanWeek(week.week, {
                        workoutFocus: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="planWeekField">
                  Easy guidance
                  <textarea
                    value={week.easyRunGuidance}
                    onChange={(event) =>
                      handleUpdatePlanWeek(week.week, {
                        easyRunGuidance: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="planWeekField">
                  Notes
                  <textarea
                    value={week.notes}
                    onChange={(event) =>
                      handleUpdatePlanWeek(week.week, {
                        notes: event.target.value,
                      })
                    }
                  />
                </label>
              </article>
            ))}
          </div>
        </section>

        {trainingPlan.whyThisPlan && trainingPlan.whyThisPlan.length > 0 && (
          <section className="card">
            <h2>Why This Plan</h2>
            <ul className="planAssumptions">
              {trainingPlan.whyThisPlan.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="card">
          <h2>Assumptions</h2>
          <ul className="planAssumptions">
            {trainingPlan.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  return (



    <main className="app">
    <header className="topBar">
  <div>
    <p className="eyebrow">AI-powered training analysis</p>
    <h1>Race Readiness</h1>
    <p className="topBarSubtitle">
      Understand your training, current race capability, and what to do next.
    </p>
  </div>

  <div className="topBarActions">
    {unitToggle}
    <div className="buttonRow">
      <button className="secondaryButton" onClick={handleImportDataClick}>
        Import Data
      </button>
      <button
        className="secondaryButton"
        onClick={handleImportStravaRuns}
        disabled={isImportingStrava}
      >
        {isImportingStrava ? "Importing..." : "Import Strava"}
      </button>
      <button className="primaryButton" onClick={handleAnalyzeFitness}>
        Analyze Fitness
      </button>
      <button
        className="planButton"
        onClick={handleOpenPlanIntake}
        disabled={isGeneratingTrainingPlan}
      >
        {isGeneratingTrainingPlan ? "Generating..." : "Generate Training Plan"}
      </button>
    </div>
  </div>

  <input
    ref={importInputRef}
    className="hiddenFileInput"
    type="file"
    accept="application/json,.json"
    onChange={handleImportRuns}
  />
</header>

      {actionMessage && <p className="actionStatus">{actionMessage}</p>}

      {planIntakeModal}

      <nav className="dashboardTabs" aria-label="Dashboard sections">
        {[
          ["overview", "Overview"],
          ["calendar", "Calendar"],
          ["activities", "Activities"],
          ["zones", "Zones"],
          ["coach", "AI Coach"],
        ].map(([view, label]) => (
          <button
            className={dashboardView === view ? "activeDashboardTab" : ""}
            key={view}
            type="button"
            onClick={() => setDashboardView(view as DashboardView)}
          >
            {label}
          </button>
        ))}
      </nav>

      {dashboardView === "overview" && (
        <>
   <div className="dashboardGrid">

  <section className="heroCard">
    <div>
      <p className="eyebrow">Current Status</p>
      <h2>You are building a strong base</h2>
      <p className="bodyText">
        Dashboard stats use the most recent 7-day training window. Race-tagged
        Strava activities are used as race data automatically.
      </p>
    </div>

    <div className="scoreBox">
      <p>Fitness Score</p>
      <strong>{fitnessScore}</strong>
      <span>out of 100</span>
    </div>
  </section>

  <section className="statsGrid">
    <StatCard title="7-Day Distance" value={formatDistance(totalMiles)} />
    <StatCard title="Longest Run" value={formatDistance(longestRun)} />
    <StatCard title="Runs in 7 Days" value={`${numberOfRuns}`} />
    <StatCard title="90-Day Avg" value={formatWeeklyDistance(trendAverageWeeklyMiles)} />
    <StatCard title="Training Status" value={trainingLoadMetrics.status} />
  </section>
</div>

      {currentRaceCapabilities && (
        <section className="card capabilityPanel">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Current Race Capability</p>
              <h2>What your imported race history supports today</h2>
              <p>
                Equivalent race performances from your strongest imported
                race-tagged efforts. These do not assume future fitness gains
                and do not add conservative distance penalties.
              </p>
            </div>
          </div>

          <div className="capabilityGrid">
            <div>
              <span>5K</span>
              <strong>{currentRaceCapabilities.fiveK}</strong>
            </div>
            <div>
              <span>10K</span>
              <strong>{currentRaceCapabilities.tenK}</strong>
            </div>
            <div>
              <span>Half Marathon</span>
              <strong>{currentRaceCapabilities.halfMarathon}</strong>
            </div>
            <div>
              <span>Marathon</span>
              <strong>{currentRaceCapabilities.marathon}</strong>
            </div>
          </div>

          <p className="capabilityNote">
            Longer-distance results still depend on race-day endurance,
            fueling, course, and weather.
          </p>
        </section>
      )}

      <section className="card loadPanel">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Training Load</p>
            <h2>Fitness, fatigue, and form</h2>
            <p>
              This compares your last 7 days against your 6-week baseline using
              distance, effort, and heart rate when available. These are relative
              load points, not scores out of 100.
            </p>
          </div>

          <div className="loadHeaderActions">
            <span className={`loadStatus loadStatus${trainingLoadMetrics.status}`}>
              {trainingLoadMetrics.status}
            </span>

            <details className="loadHelp">
              <summary aria-label="How training load is calculated" title="How training load is calculated">
                ?
              </summary>
              <div className="loadHelpPopup">
                <strong>How this is calculated</strong>
                <p><b>Run load</b> = distance × effort multiplier × heart-rate multiplier.</p>
                <p><b>Fatigue</b> = total run load from the latest 7 days.</p>
                <p><b>Fitness</b> = average weekly run load across 6 weeks.</p>
                <p><b>Form</b> = fitness − fatigue.</p>
                <p><b>Ramp</b> = percentage difference between fatigue and fitness.</p>
                <small>Load points are relative to your own training, not out of 100.</small>
              </div>
            </details>
          </div>
        </div>

        <div className="loadMetricGrid">
          <div>
            <span>Fatigue</span>
            <strong>{trainingLoadMetrics.acuteLoad}</strong>
            <p>Load points from last 7 days</p>
          </div>

          <div>
            <span>Fitness</span>
            <strong>{trainingLoadMetrics.chronicLoad}</strong>
            <p>Average weekly load points over 6 weeks</p>
          </div>

          <div>
            <span>Form</span>
            <strong>{trainingLoadMetrics.form}</strong>
            <p>Positive = fresh; negative = fatigued</p>
          </div>

          <div>
            <span>Ramp</span>
            <strong>{trainingLoadMetrics.rampRate}%</strong>
            <p>Recent load vs baseline</p>
          </div>
        </div>

        <p className="loadExplanation">{trainingLoadMetrics.explanation}</p>
      </section>
        </>
      )}

      {(dashboardView === "overview" || dashboardView === "coach") && (
      <section className="analyticsGrid">
        {dashboardView === "overview" && (
        <section className="card fitnessChartCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Fitness Chart</p>
              <h2>8-week load trend</h2>
              <p>
                Fitness and fatigue use relative load points. Form is fitness
                minus fatigue and is shown around the zero line below.
              </p>
            </div>
          </div>

          <div className="loadChartWithScale">
            <div className="loadChartScale" aria-hidden="true">
              <span>{chartScaleMax}</span>
              <span>{Math.round(chartScaleMax / 2)}</span>
              <span>0</span>
            </div>

            <div className="fitnessChart">
              {fitnessTimeline.map((point) => (
                <div className="chartColumn" key={point.date}>
                  <div className="chartBars">
                    <span
                      className="chartBar chartBarFitness"
                      style={{ height: `${Math.max(6, (point.chronicLoad / maxChartLoad) * 100)}%` }}
                      title={`Fitness ${point.chronicLoad} load points`}
                    />
                    <span
                      className="chartBar chartBarFatigue"
                      style={{ height: `${Math.max(6, (point.acuteLoad / maxChartLoad) * 100)}%` }}
                      title={`Fatigue ${point.acuteLoad} load points`}
                    />
                  </div>
                  <strong>{point.form > 0 ? `+${point.form}` : point.form}</strong>
                  <span>{getShortDateLabel(point.date)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="formChart">
            <div className="formChartLabel">
              <strong>Form</strong>
              <span>Fresh</span>
              <span>Fatigued</span>
            </div>
            <div className="formChartPlot">
              <div className="formZeroLine"><span>0</span></div>
              {fitnessTimeline.map((point, index) => (
                <span
                  className={`formPoint${point.form >= 0 ? " formPointFresh" : " formPointFatigued"}`}
                  key={point.date}
                  style={{
                    left: `${((index + 0.5) / fitnessTimeline.length) * 100}%`,
                    top: `${50 - (point.form / maxAbsoluteForm) * 42}%`,
                  }}
                  title={`${getShortDateLabel(point.date)} form: ${point.form}`}
                />
              ))}
            </div>
          </div>

          <div className="chartLegend">
            <span><i className="legendFitness" /> Fitness load points</span>
            <span><i className="legendFatigue" /> Fatigue load points</span>
            <span><i className="legendFormFresh" /> Positive form = fresher</span>
            <span><i className="legendFormFatigued" /> Negative form = more fatigued</span>
          </div>
        </section>
        )}

        {dashboardView === "coach" && (
        <section className="card coachCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">AI Coach</p>
              <h2>Weekly check-in</h2>
              <p>Uses your load trend, recent runs, race goal, HR zones, and pace zones.</p>
            </div>

            <button
              className="aiButton coachButton"
              onClick={handleGenerateCoachCheckIn}
              disabled={isLoadingCoach}
            >
              {isLoadingCoach ? "Generating..." : "Generate Check-In"}
            </button>
          </div>

          {coachInsight ? (
            <div className="coachInsightGrid">
              <div>
                <span>Headline</span>
                <strong>{coachInsight.headline}</strong>
              </div>
              <div>
                <span>What changed</span>
                <p>{coachInsight.whatChanged}</p>
              </div>
              <div>
                <span>Next move</span>
                <p>{coachInsight.nextMove}</p>
              </div>
              <div>
                <span>Watch out</span>
                <p>{coachInsight.watchOut}</p>
              </div>
            </div>
          ) : (
            <p className="coachEmpty">
              Generate a check-in when you want the app to explain the week in plain English.
            </p>
          )}
        </section>
        )}
      </section>
      )}

      {dashboardView === "calendar" && (
      <section className="card calendarCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Training Calendar</p>
            <h2>{calendarMonthLabel}</h2>
            <p>Click a day with a run to open its activity details.</p>
          </div>

          <div className="calendarControls">
            <button
              className="calendarArrowButton"
              type="button"
              aria-label="Previous month"
              title="Previous month"
              onClick={() => changeCalendarMonth(-1)}
            >
              &larr;
            </button>
            <button
              className="calendarTodayButton"
              type="button"
              onClick={() => setCalendarReferenceDate(new Date())}
            >
              Today
            </button>
            <button
              className="calendarArrowButton"
              type="button"
              aria-label="Next month"
              title="Next month"
              onClick={() => changeCalendarMonth(1)}
            >
              &rarr;
            </button>
          </div>
        </div>

        <div className="calendarWeekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendarGrid">
          {calendarDays.map((day) => (
            <button
              className={`calendarDay${day.isCurrentMonth ? "" : " calendarDayMuted"}${day.runs.length > 0 ? " calendarDayHasRun" : ""}${day.plannedWorkouts.length > 0 ? " calendarDayHasPlan" : ""}`}
              key={day.date}
              type="button"
              onClick={() => {
                if (day.runs[0]) {
                  handleSelectRun(day.runs[0]);
                }
              }}
              disabled={day.runs.length === 0 && day.plannedWorkouts.length === 0}
            >
              <span>{day.day}</span>
              <div className="calendarDayDetails">
                {day.runs.length > 0 && (
                  <strong>{formatDistance(day.miles)} done</strong>
                )}
                {day.plannedWorkouts.length > 0 && (
                  <em>{formatDistance(day.plannedMiles)} planned</em>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>
      )}

      {dashboardView === "zones" && (
      <section className="card zonesCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Zones</p>
            <h2>HR and pace guidance</h2>
            <p>These are practical buckets for planning. Exact zones can be refined later.</p>
          </div>
        </div>

        <div className="heartRateSettings">
          <div>
            <span>Observed from Strava</span>
            <strong>
              {observedMaxHeartRate ? `${observedMaxHeartRate} bpm` : "No HR data"}
            </strong>
            <p>The highest heart rate found in the latest 90 days.</p>
          </div>

          <label>
            Max HR used for zones
            <input
              type="number"
              min="100"
              max="240"
              placeholder={observedMaxHeartRate ? String(observedMaxHeartRate) : "Enter max HR"}
              value={configuredMaxHeartRate ?? ""}
              onChange={(event) => {
                const nextHeartRate = Number(event.target.value);

                setConfiguredMaxHeartRate(
                  nextHeartRate >= 100 && nextHeartRate <= 240
                    ? nextHeartRate
                    : null
                );
              }}
            />
            <small>
              Leave blank to use the observed Strava maximum. Enter your tested
              or known max HR for more accurate zones.
            </small>
          </label>

          <div>
            <span>Currently using</span>
            <strong>
              {effectiveMaxHeartRate ? `${effectiveMaxHeartRate} bpm` : "No HR data"}
            </strong>
            <p>{configuredMaxHeartRate ? "Your configured maximum." : "The observed Strava maximum."}</p>
          </div>
        </div>

        <div className="zonesLayout">
          <div>
            <h3>Heart rate zones</h3>
            <div className="compactZoneGrid">
              {heartRateZones.map((zone) => (
                <div key={zone.name}>
                  <span>{zone.name}</span>
                  <strong>{zone.range}</strong>
                  <p>{zone.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3>Pace zones</h3>
            <div className="compactZoneGrid">
              {paceZones.map((zone) => (
                <div key={zone.name}>
                  <span>{zone.name}</span>
                  <strong>{zone.range}</strong>
                  <p>{zone.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      )}

      {dashboardView === "activities" && (
      <section className="contentGrid">
        <div className="card largeCard">
          <div className="sectionHeader">
            <div>
              <h2>Recent Runs</h2>
              <p>
                {showAllRuns
                  ? `Showing all ${runs.length} activities.`
                  : `Showing ${visibleRuns.length} recent activities.`}
              </p>
            </div>

            {runs.length > RECENT_RUN_LIMIT && (
              <button
                className="smallButton"
                onClick={() => setShowAllRuns((current) => !current)}
              >
                {showAllRuns ? "Show Recent" : "View All"}
              </button>
            )}
          </div>

<div className="runList">
  {visibleRuns.map((run) => (
    <RunCard
      key={`${run.date}-${run.type}-${run.distanceMiles}`}
      run={run}
      onSelect={handleSelectRun}
      formatDistance={formatDistance}
      formatPace={formatRunPace}
    />
  ))}
</div>

        </div>

      </section>
      )}

      {dashboardView === "coach" && (
      <section className="card" ref={summarySectionRef}>
        <div className="sectionHeader">
          <div>
            <h2>AI Fitness Summary</h2>
            <p>Refresh after importing Strava to update strengths, risks, and suggestions.</p>
          </div>
          <button
            className="aiButton coachButton"
            onClick={handleRefreshAISummary}
            disabled={isLoadingAI || !isPastRaceTimeValid}
          >
            {isLoadingAI ? "Refreshing..." : "Refresh AI Summary"}
          </button>
        </div>
        
        <h3>{aiSummary ? aiSummary.headline : aiCoachSummary.headline}</h3>

<p className="bodyText">
  {aiSummary ? aiSummary.summary : aiCoachSummary.summary}
</p>

        <div className="breakdownGrid">
  <div className="breakdownBox">
    <p>This Week's Distance</p>
    <strong>{fitnessBreakdown.mileage}</strong>
  </div>

  <div className="breakdownBox">
    <p>This Week's Long Run</p>
    <strong>{fitnessBreakdown.longRun}</strong>
  </div>

  <div className="breakdownBox">
    <p>This Week's Consistency</p>
    <strong>{fitnessBreakdown.consistency}</strong>
  </div>
</div>

<div className="insightGrid">
  <div className="insightBox">
    <p className="insightLabel">Strengths</p>
    <ul>
      {(aiSummary ? aiSummary.strengths : aiCoachSummary.strengths).length > 0 ? (
        (aiSummary ? aiSummary.strengths : aiCoachSummary.strengths).map(
          (strength) => (
          <li key={strength}>{strength}</li>
          )
        )
      ) : (
        <li>No clear strengths detected from the current data yet.</li>
      )}
    </ul>
  </div>

  <div className="insightBox">
    <p className="insightLabel">Risks</p>
    <ul>
      {(aiSummary ? aiSummary.risks : aiCoachSummary.risks).length > 0 ? (
        (aiSummary ? aiSummary.risks : aiCoachSummary.risks).map((risk) => (
          <li key={risk}>{risk}</li>
        ))
      ) : (
        <li>No major risks detected from the current data.</li>
      )}
    </ul>
  </div>

  <div className="insightBox">
    <p className="insightLabel">Suggestions</p>
    <ul>
      {(aiSummary ? aiSummary.suggestions : aiCoachSummary.suggestions).length > 0 ? (
        (aiSummary ? aiSummary.suggestions : aiCoachSummary.suggestions).map(
          (suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        )
        )
      ) : (
        <li>Keep training consistently and refresh after your next week.</li>
      )}
    </ul>
  </div>
</div>

        <div className="buttonRow bottomButtons">
          <button className="secondaryButton" onClick={handleResetSampleData}>
            Reset Sample Data
          </button>
          <button className="secondaryButton" onClick={handleExportReport}>
            Export Report
          </button>
        </div>
      </section>
      )}
    </main>
  );
}

export default App;
