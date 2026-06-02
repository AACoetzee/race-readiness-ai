import { useEffect, useRef, useState } from "react";
import "./index.css";
import { sampleRuns, type Run } from "./data/sampleRuns";
import { generateAICoachSummary } from "./utils/aiCoachSummary";

import {
  calculateFitnessScore,
  calculateLongestRun,
  calculateNumberOfRuns,
  calculateTotalMiles,
  calculateRacePredictions,
  calculateFitnessBreakdown,
  calculateTrainingLoad,
  calculateTrainingLoadMetrics,
  calculateRunTrainingStress,
  calculateTrainingLoadTimeline,
  convertRaceTimeToMinutes,
} from "./utils/fitnessCalculations";

import StatCard from "./components/StatCard";
import RunCard from "./components/RunCard";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const TRAINING_PLAN_URL = `${API_BASE_URL}/api/training-plan`;
const COACH_CHECK_IN_URL = `${API_BASE_URL}/api/coach-check-in`;
const STRAVA_RUNS_URL = `${API_BASE_URL}/api/strava/runs`;
const RECENT_RUN_LIMIT = 4;
const TRAINING_WINDOW_DAYS = 7;
const TREND_WINDOW_DAYS = 90;
const SAVED_TRAINING_PLAN_KEY = "race-readiness-training-plan";
const SAVED_PLAN_PREFERENCES_KEY = "race-readiness-plan-preferences";
type PageView = "dashboard" | "trainingPlan" | "activityDetail";
type DashboardView = "overview" | "calendar" | "activities" | "zones" | "coach";

function getStorage() {
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

type PlannedWorkout = {
  date: string;
  title: string;
  type: "Long run" | "Workout" | "Easy";
  miles: number;
  week: number;
};

function isRun(value: unknown): value is Run {
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
      description: "Most normal mileage",
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

function formatPaceFromMinutes(minutesPerMile: number) {
  const totalSeconds = Math.max(0, Math.round(minutesPerMile * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /mi`;
}

function getGoalPaceMinutes(goalRace: string, selectedGoalTime: string) {
  const goalTimeMinutes = convertRaceTimeToMinutes(selectedGoalTime);

  if (goalTimeMinutes <= 0) {
    return null;
  }

  return goalTimeMinutes / getRaceDistanceMiles(goalRace);
}

function createPaceZones(goalRace: string, selectedGoalTime: string): PaceZone[] {
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
      range: `${formatPaceFromMinutes(goalPace + 1.5)}-${formatPaceFromMinutes(goalPace + 2.5)}`,
      description: "Most normal mileage and recovery days",
    },
    {
      name: "Steady",
      label: "Controlled",
      range: `${formatPaceFromMinutes(goalPace + 0.75)}-${formatPaceFromMinutes(goalPace + 1.5)}`,
      description: "Comfortably moderate running",
    },
    {
      name: "Tempo",
      label: "Threshold",
      range: `${formatPaceFromMinutes(goalPace + 0.2)}-${formatPaceFromMinutes(goalPace + 0.6)}`,
      description: "Sustained workout efforts",
    },
    {
      name: "Race",
      label: goalRace,
      range: `${formatPaceFromMinutes(goalPace - 0.1)}-${formatPaceFromMinutes(goalPace + 0.1)}`,
      description: "Current estimated goal-race pace",
    },
    {
      name: "Fast",
      label: "Speed",
      range: `${formatPaceFromMinutes(goalPace - 0.75)}-${formatPaceFromMinutes(goalPace - 0.25)}`,
      description: "Short intervals and strides",
    },
  ];
}

function getWeekdayIndex(dayName: string) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(dayName);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
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

function getEasyRunDay(longRunDay: string, restDay: string, workoutDay: string) {
  const preferredDays = ["Thursday", "Friday", "Wednesday", "Tuesday", "Saturday"];

  return (
    preferredDays.find(
      (day) => day !== longRunDay && day !== restDay && day !== workoutDay
    ) ?? "Thursday"
  );
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
  const workoutDay = getWorkoutDay(preferences.longRunDay, preferences.restDay);
  const easyRunDay = getEasyRunDay(
    preferences.longRunDay,
    preferences.restDay,
    workoutDay
  );

  return plan.weeks.flatMap((week) => {
    const currentWeekStart = addDays(weekStart, (week.week - 1) * 7);
    const longRunDate = getWeekdayDate(currentWeekStart, preferences.longRunDay);
    const workoutDate = getWeekdayDate(currentWeekStart, workoutDay);
    const easyMileage = Math.max(
      0,
      Number((week.targetMiles - week.longRunMiles).toFixed(1))
    );
    const workouts: PlannedWorkout[] = [
      {
        date: formatDateForInput(longRunDate),
        title: `Week ${week.week} long run`,
        type: "Long run",
        miles: week.longRunMiles,
        week: week.week,
      },
    ];

    if (week.workoutFocus && week.phase !== "Race week") {
      workouts.push({
        date: formatDateForInput(workoutDate),
        title: week.workoutFocus,
        type: "Workout",
        miles: Number(Math.min(week.targetMiles * 0.28, easyMileage).toFixed(1)),
        week: week.week,
      });
    }

    if (easyMileage > 0) {
      workouts.push({
        date: formatDateForInput(getWeekdayDate(currentWeekStart, easyRunDay)),
        title: "Easy mileage",
        type: "Easy",
        miles: Number(Math.max(0, easyMileage - workouts.slice(1).reduce((sum, workout) => sum + workout.miles, 0)).toFixed(1)),
        week: week.week,
      });
    }

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

function formatMiles(miles: number) {
  return Number(miles.toFixed(2)).toString();
}

function formatOptionalHeartRate(heartRate?: number) {
  return heartRate ? `${Math.round(heartRate)} bpm` : "No HR data";
}

function formatOptionalFeet(feet?: number) {
  return typeof feet === "number" ? `${Math.round(feet)} ft` : "Not available";
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

  return `${Math.round((run.averageHeartRate / observedMaxHeartRate) * 100)}% of observed max`;
}

function formatDateForInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDaysBetweenDates(startDate: string, endDate: Date) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(formatDateForInput(endDate) + "T00:00:00");
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / millisecondsPerDay)
  );
}

function App() {
const [goalRace, setGoalRace] = useState("Half Marathon");
const [pastRaceDistance, setPastRaceDistance] = useState("5K");
const [pastRaceTime, setPastRaceTime] = useState("00:00"); 
const [runs, setRuns] = useState<Run[]>(sampleRuns);
const [showAllRuns, setShowAllRuns] = useState(false);
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

const today = new Date();

const goalDate = new Date(goalRaceDate);
const currentDate = formatDateForInput(today);

const weeksUntilGoalRace = Math.max(
  0,
  Math.ceil(
    (goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)
  )
);

function clearAiSummary() {
  setAiSummary(null);
}

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
const planTrendRuns = trendRuns.filter((run) => !run.isRace);
const planSourceRuns = planTrendRuns.length > 0 ? planTrendRuns : trendRuns;
const planTrendLongestRun = calculateLongestRun(planSourceRuns);
const fitnessTimeline = calculateTrainingLoadTimeline(trendRuns, 8);
const plannedWorkouts = getPlannedWorkouts(trainingPlan, currentDate, planPreferences);
const calendarReferenceDate = new Date(`${currentDate}T00:00:00`);
const calendarDays = getCalendarDays(runs, plannedWorkouts, calendarReferenceDate);
const calendarMonthLabel = getCalendarMonthLabel(calendarReferenceDate);
const heartRateZones = createHeartRateZones(observedMaxHeartRate);
const maxChartLoad = Math.max(
  1,
  ...fitnessTimeline.flatMap((point) => [point.acuteLoad, point.chronicLoad])
);

const racePredictions = isPastRaceTimeValid
  ? calculateRacePredictions(
      trendRuns,
      effectivePastRaceDistance,
      effectivePastRaceTime,
      weeksUntilGoalRace
    )
  : null;

const fitnessBreakdown = calculateFitnessBreakdown(trainingRuns);
const trainingLoad = calculateTrainingLoad(trainingRuns);
const trainingLoadMetrics = calculateTrainingLoadMetrics(trendRuns);

const selectedGoalTime = racePredictions
  ? goalRace === "5K"
    ? racePredictions.fiveK
    : goalRace === "10K"
    ? racePredictions.tenK
    : goalRace === "Half Marathon"
    ? racePredictions.halfMarathon
    : racePredictions.marathon
  : "Enter a valid time";
const paceZones = createPaceZones(goalRace, selectedGoalTime);

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
const [coachInsight, setCoachInsight] = useState<CoachInsight | null>(null);
const visibleRuns = showAllRuns ? runs : runs.slice(0, RECENT_RUN_LIMIT);

useEffect(() => {
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
  const storage = getStorage();

  if (storage) {
    storage.setItem(
      SAVED_PLAN_PREFERENCES_KEY,
      JSON.stringify(planPreferences)
    );
  }
}, [planPreferences]);

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
}

function handleImportDataClick() {
  importInputRef.current?.click();
}

async function handleImportStravaRuns() {
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
  const observedMaxHeartRate = getObservedMaxHeartRate(planSourceRuns);
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
        trendLongestRun: planTrendLongestRun,
        trendNumberOfRuns,
        selectedGoalTime,
        raceDataSource,
        mostRecentRace,
        observedMaxHeartRate,
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
      heartRateMax: observedMaxHeartRate,
      heartRateZones: createHeartRateZones(observedMaxHeartRate),
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
            <span>Race-tagged Strava baseline</span>
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
          Strava base: {formatMiles(trendAverageWeeklyMiles)} mi/wk over 90
          days, longest non-race run {formatMiles(planTrendLongestRun)} mi,{" "}
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
  trainingLoad,
  goalRace,
  selectedGoalTime,
});

  if (pageView === "activityDetail" && selectedRun) {
    const runStress = Number(calculateRunTrainingStress(selectedRun).toFixed(1));
    const stressLabel = getRunStressLabel(runStress);

    return (
      <main className="app">
        <header className="topBar">
          <div>
            <p className="eyebrow">Activity Detail</p>
            <h1>{selectedRun.type}</h1>
          </div>

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
        </header>

        <section className="activityHero">
          <div>
            <p className="eyebrow">{selectedRun.date}</p>
            <h2>{formatMiles(selectedRun.distanceMiles)} miles</h2>
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

        <section className="activityGrid">
          <div className="card activityMetricCard">
            <p className="cardLabel">Core Stats</p>
            <div className="activityMetricList">
              <div>
                <span>Distance</span>
                <strong>{formatMiles(selectedRun.distanceMiles)} mi</strong>
              </div>
              <div>
                <span>Pace</span>
                <strong>{selectedRun.pace}</strong>
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
                <strong>{getRunHeartRatePercent(selectedRun, observedMaxHeartRate)}</strong>
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
                <strong>{formatOptionalFeet(selectedRun.elevationGainFeet)}</strong>
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

          <div className="buttonRow">
            <button
              className="secondaryButton"
              onClick={() => setPageView("dashboard")}
            >
              Back to Dashboard
            </button>
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
            <StatCard title="90-Day Avg" value={`${formatMiles(trendAverageWeeklyMiles)} mi/wk`} />
            <StatCard title="AI Confidence" value={trainingPlan.confidence} />
            <StatCard
              title="Observed Max HR"
              value={trainingPlan.heartRateMax ? `${trainingPlan.heartRateMax} bpm` : "No HR"}
            />
          </div>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <div>
              <h2>Heart Rate Guidance</h2>
              <p>
                These are guidance ranges from observed HR data, not exact time-in-zone totals.
              </p>
            </div>
          </div>

          <div className="zoneGrid">
            {trainingPlan.heartRateZones.map((zone) => (
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
              <h2>Basic Plan</h2>
              <p>Use this as a simple guide, then adjust around fatigue, life, and workouts.</p>
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
                    <span>Mileage</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={week.targetMiles}
                      onChange={(event) =>
                        handleUpdatePlanWeek(week.week, {
                          targetMiles: Number(event.target.value),
                        })
                      }
                    />
                  </div>

                  <div>
                    <span>Long run</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={week.longRunMiles}
                      onChange={(event) =>
                        handleUpdatePlanWeek(week.week, {
                          longRunMiles: Number(event.target.value),
                        })
                      }
                    />
                  </div>
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
          <p className="eyebrow">Race Readiness AI</p>
          <h1>Running Fitness Dashboard</h1>
        </div>

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
    <StatCard title="7-Day Mileage" value={`${formatMiles(totalMiles)} mi`} />
    <StatCard title="Longest Run" value={`${formatMiles(longestRun)} mi`} />
    <StatCard title="Runs in 7 Days" value={`${numberOfRuns}`} />
    <StatCard title="90-Day Avg" value={`${formatMiles(trendAverageWeeklyMiles)} mi/wk`} />
    <StatCard title="Training Status" value={trainingLoadMetrics.status} />
  </section>
</div>

      <section className="card loadPanel">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Training Load</p>
            <h2>Fitness, fatigue, and form</h2>
            <p>
              This compares your last 7 days against your 6-week baseline using
              mileage, effort, and heart rate when available.
            </p>
          </div>

          <span className={`loadStatus loadStatus${trainingLoadMetrics.status}`}>
            {trainingLoadMetrics.status}
          </span>
        </div>

        <div className="loadMetricGrid">
          <div>
            <span>Fatigue</span>
            <strong>{trainingLoadMetrics.acuteLoad}</strong>
            <p>Last 7 days</p>
          </div>

          <div>
            <span>Fitness</span>
            <strong>{trainingLoadMetrics.chronicLoad}</strong>
            <p>6-week baseline</p>
          </div>

          <div>
            <span>Form</span>
            <strong>{trainingLoadMetrics.form}</strong>
            <p>Fitness minus fatigue</p>
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
              <p>Fitness is your 6-week baseline. Fatigue is your last 7 days.</p>
            </div>
          </div>

          <div className="fitnessChart">
            {fitnessTimeline.map((point) => (
              <div className="chartColumn" key={point.date}>
                <div className="chartBars">
                  <span
                    className="chartBar chartBarFitness"
                    style={{ height: `${Math.max(6, (point.chronicLoad / maxChartLoad) * 100)}%` }}
                    title={`Fitness ${point.chronicLoad}`}
                  />
                  <span
                    className="chartBar chartBarFatigue"
                    style={{ height: `${Math.max(6, (point.acuteLoad / maxChartLoad) * 100)}%` }}
                    title={`Fatigue ${point.acuteLoad}`}
                  />
                </div>
                <strong>{point.form}</strong>
                <span>{getShortDateLabel(point.date)}</span>
              </div>
            ))}
          </div>

          <div className="chartLegend">
            <span><i className="legendFitness" /> Fitness</span>
            <span><i className="legendFatigue" /> Fatigue</span>
            <span>Number under each week = form</span>
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
                  <strong>{formatMiles(day.miles)} mi done</strong>
                )}
                {day.plannedWorkouts.length > 0 && (
                  <em>{formatMiles(day.plannedMiles)} mi planned</em>
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
    />
  ))}
</div>

        </div>

      </section>
      )}

      {dashboardView === "coach" && (
      <section className="card" ref={summarySectionRef}>
        <h2>Fitness Summary</h2>
        
        <h3>{aiSummary ? aiSummary.headline : aiCoachSummary.headline}</h3>

<p className="bodyText">
  {aiSummary ? aiSummary.summary : aiCoachSummary.summary}
</p>

        <div className="breakdownGrid">
  <div className="breakdownBox">
    <p>Mileage</p>
    <strong>{fitnessBreakdown.mileage}</strong>
  </div>

  <div className="breakdownBox">
    <p>Long Run</p>
    <strong>{fitnessBreakdown.longRun}</strong>
  </div>

  <div className="breakdownBox">
    <p>Consistency</p>
    <strong>{fitnessBreakdown.consistency}</strong>
  </div>
</div>

<div className="insightGrid">
  <div className="insightBox">
    <p className="insightLabel">Strengths</p>
    <ul>
      {(aiSummary ? aiSummary.strengths : aiCoachSummary.strengths).map(
        (strength) => (
          <li key={strength}>{strength}</li>
        )
      )}
    </ul>
  </div>

  <div className="insightBox">
    <p className="insightLabel">Risks</p>
    <ul>
      {(aiSummary ? aiSummary.risks : aiCoachSummary.risks).map((risk) => (
        <li key={risk}>{risk}</li>
      ))}
    </ul>
  </div>

  <div className="insightBox">
    <p className="insightLabel">Suggestions</p>
    <ul>
      {(aiSummary ? aiSummary.suggestions : aiCoachSummary.suggestions).map(
        (suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        )
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
