import { useRef, useState } from "react";
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
  convertRaceTimeToMinutes,
} from "./utils/fitnessCalculations";

import StatCard from "./components/StatCard";
import RunCard from "./components/RunCard";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const AI_SUMMARY_URL = `${API_BASE_URL}/api/ai-summary`;
const TRAINING_PLAN_URL = `${API_BASE_URL}/api/training-plan`;
const STRAVA_RUNS_URL = `${API_BASE_URL}/api/strava/runs`;
const RECENT_RUN_LIMIT = 4;
const TRAINING_WINDOW_DAYS = 7;
const TREND_WINDOW_DAYS = 90;
type PageView = "dashboard" | "trainingPlan";

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
};

type TrainingPlan = {
  title: string;
  overview: string;
  confidence: "Low" | "Medium" | "High";
  assumptions: string[];
  heartRateMax: number | null;
  heartRateGuidance: string[];
  heartRateZones: HeartRateZone[];
  weeks: PlanWeek[];
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
    (run.isRace === undefined || typeof run.isRace === "boolean") &&
    (run.raceDistance === undefined ||
      ["5K", "10K", "Half Marathon", "Marathon"].includes(run.raceDistance)) &&
    (run.averageHeartRate === undefined ||
      (typeof run.averageHeartRate === "number" &&
        Number.isFinite(run.averageHeartRate))) &&
    (run.maxHeartRate === undefined ||
      (typeof run.maxHeartRate === "number" && Number.isFinite(run.maxHeartRate)))
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
        typeof week.notes === "string"
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

function formatMiles(miles: number) {
  return Number(miles.toFixed(2)).toString();
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
const [pageView, setPageView] = useState<PageView>("dashboard");
const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(null);
const importInputRef = useRef<HTMLInputElement | null>(null);
const goalSectionRef = useRef<HTMLElement | null>(null);
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
const trendTotalMiles = calculateTotalMiles(trendRuns);
const trendLongestRun = calculateLongestRun(trendRuns);
const trendNumberOfRuns = calculateNumberOfRuns(trendRuns);
const trendAverageWeeklyMiles = getAverageWeeklyMiles(trendRuns, TREND_WINDOW_DAYS);
const planTrendRuns = trendRuns.filter((run) => !run.isRace);
const planSourceRuns = planTrendRuns.length > 0 ? planTrendRuns : trendRuns;
const planTrendLongestRun = calculateLongestRun(planSourceRuns);

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

const selectedGoalTime = racePredictions
  ? goalRace === "5K"
    ? racePredictions.fiveK
    : goalRace === "10K"
    ? racePredictions.tenK
    : goalRace === "Half Marathon"
    ? racePredictions.halfMarathon
    : racePredictions.marathon
  : "Enter a valid time";

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

const [isLoadingAI, setIsLoadingAI] = useState(false);
const visibleRuns = showAllRuns ? runs : runs.slice(0, RECENT_RUN_LIMIT);

function handleAnalyzeFitness() {
  summarySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  setActionMessage("Jumped to your current fitness summary.");
}

function handleAddGoalRace() {
  goalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  setActionMessage("Jumped to the goal race form.");
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
      }),
    });
    const data = await response.json();

    if (!response.ok || !isTrainingPlanResponse(data)) {
      throw new Error(data.overview || "Could not generate a training plan.");
    }

    setTrainingPlan({
      ...data,
      heartRateMax: observedMaxHeartRate,
      heartRateZones: createHeartRateZones(observedMaxHeartRate),
    });
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

async function handleGenerateAISummary() {
  setIsLoadingAI(true);

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
        trendWindowDays: TREND_WINDOW_DAYS,
        trendTotalMiles,
        trendLongestRun,
        trendNumberOfRuns,
        trendAverageWeeklyMiles,
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

    setAiSummary(data);
  } catch (error) {
    console.error(error);

    setAiSummary({
  headline: "AI summary is unavailable right now.",
  summary: "Something went wrong while calling the AI backend.",
  aiAdjustedGoalTime: selectedGoalTime,
  confidence: "Unknown",
  dateAssessment: "No date assessment is available.",
  strengths: [],
  risks: [],
  suggestions: [],
});

  } finally {
    setIsLoadingAI(false);
  }
}

  const aiCoachSummary = generateAICoachSummary({
  totalMiles,
  longestRun,
  numberOfRuns,
  fitnessScore,
  trainingLoad,
  goalRace,
  selectedGoalTime,
});

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
                <div>
                  <p className="cardLabel">Week {week.week}</p>
                  <h3>{week.phase}</h3>
                </div>

                <div className="planWeekStats">
                  <div>
                    <span>Mileage</span>
                    <strong>{week.targetMiles} mi</strong>
                  </div>

                  <div>
                    <span>Long run</span>
                    <strong>{week.longRunMiles} mi</strong>
                  </div>
                </div>

                <p>{week.workoutFocus}</p>
                <p>{week.easyRunGuidance}</p>
                <p className="mutedText">{week.notes}</p>
              </article>
            ))}
          </div>
        </section>

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
            onClick={handleGenerateTrainingPlan}
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
    <StatCard title="Training Load" value={trainingLoad} />
  </section>
</div>

      <section className="contentGrid">


   <section className="card goalCard" ref={goalSectionRef}>
  <div className="goalHeader">
    <div>
      <p className="eyebrow">Goal Race</p>
      <h2>{goalRace}</h2>
    </div>

    <span>{weeksUntilGoalRace} weeks away</span>
  </div>

  <div className="goalButtons">
    <button
      className={goalRace === "5K" ? "activeGoalButton" : ""}
      onClick={() => {
  setGoalRace("5K");
  clearAiSummary();
}}
    >
      5K
    </button>

    <button
      className={goalRace === "10K" ? "activeGoalButton" : ""}
      onClick={() => {
  setGoalRace("10K");
  clearAiSummary();
}}
    >
      10K
    </button>

    <button
      className={goalRace === "Half Marathon" ? "activeGoalButton" : ""}
      onClick={() => {
  setGoalRace("Half Marathon");
  clearAiSummary();
}}
    >
      Half Marathon
    </button>

    <button
      className={goalRace === "Marathon" ? "activeGoalButton" : ""}
      onClick={() => {
  setGoalRace("Marathon");
  clearAiSummary();
}}
    >
      Marathon
    </button>
  </div>

  <div className="goalDashboardGrid">
    <div className="goalInfoCard">
      <p className="cardLabel">Formula estimate</p>

      {mostRecentRace && (
        <p className="raceSourceText">
          Using latest race-tagged Strava activity:{" "}
          <strong>{mostRecentRace.type}</strong> on {mostRecentRace.date}.
        </p>
      )}

      <p className="goalFormulaText">
        {isPastRaceTimeValid ? (
          <>
            Based on your past {effectivePastRaceDistance} time of{" "}
            <strong>{effectivePastRaceTime}</strong>, your estimated {goalRace} time is:
          </>
        ) : (
          <>Import a Strava race-tagged activity or enter a manual race time.</>
        )}
      </p>

      <strong className="formulaTime">{selectedGoalTime}</strong>

      <button
        className="aiButton"
        onClick={handleGenerateAISummary}
        disabled={isLoadingAI || !isPastRaceTimeValid}
      >
        {isLoadingAI ? "Generating..." : "Generate AI Summary"}
      </button>
    </div>

    <div className="goalInputCard">
      <p className="cardLabel">
        {mostRecentRace ? "Detected race data" : "Past race details"}
      </p>

      {mostRecentRace ? (
        <div className="detectedRaceBox">
          <div>
            <p>Race source</p>
            <strong>Strava race tag</strong>
          </div>

          <div>
            <p>Activity</p>
            <strong>{mostRecentRace.type}</strong>
          </div>

          <div>
            <p>Race distance</p>
            <strong>{effectivePastRaceDistance}</strong>
          </div>

          <div>
            <p>Race time</p>
            <strong>{effectivePastRaceTime}</strong>
          </div>

          <div>
            <p>Race date</p>
            <strong>{effectivePastRaceDate}</strong>
          </div>

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
        </div>
      ) : (
        <div className="pastRaceForm">
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

          {!isPastRaceTimeValid && (
            <span className="inputError">
              Please enter a valid time like 22:30 or 1:43:20.
            </span>
          )}
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
      </div>
      )}
    </div>

    {aiSummary && (
      <div className="goalAiCard">
        <p className="cardLabel">AI adjusted estimate</p>
        <strong>{aiSummary.aiAdjustedGoalTime}</strong>
        <span>Confidence: {aiSummary.confidence}</span>
        <p>{aiSummary.dateAssessment}</p>
      </div>
    )}
  </div>
</section>


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
    <RunCard key={run.date} run={run} />
  ))}
</div>

        </div>

      </section>

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
          <button className="secondaryButton" onClick={handleAddGoalRace}>
            Add Goal Race
          </button>
          <button className="secondaryButton" onClick={handleExportReport}>
            Export Report
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;
