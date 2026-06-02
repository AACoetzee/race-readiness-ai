import type { Run } from "../data/sampleRuns";

export type TrainingLoadMetrics = {
  acuteLoad: number;
  chronicLoad: number;
  form: number;
  rampRate: number;
  status: "Building" | "Maintaining" | "Fresh" | "Overreaching" | "Low";
  explanation: string;
};

export type TrainingLoadTimelinePoint = TrainingLoadMetrics & {
  date: string;
  totalMiles: number;
};

// Total mileage is the simplest base metric used across cards and reports.
export function calculateTotalMiles(runs: Run[]) {
  return runs.reduce((sum, run) => {
    return sum + run.distanceMiles;
  }, 0);
}

// Longest run matters because longer race goals need enough endurance exposure.
export function calculateLongestRun(runs: Run[]) {
  if (runs.length === 0) {
    return 0;
  }

  return Math.max(...runs.map((run) => run.distanceMiles));
}

// Run count is a basic consistency signal.
export function calculateNumberOfRuns(runs: Run[]) {
  return runs.length;
}

// The score is intentionally simple: mileage, long run, consistency, workouts,
// and whether the longest run dominates the week too much.
export function calculateFitnessScore(runs: Run[]) {
  const totalMiles = calculateTotalMiles(runs);
  const longestRun = calculateLongestRun(runs);
  const numberOfRuns = calculateNumberOfRuns(runs);

  const hasHardWorkout = runs.some((run) => run.effort === "Hard");

  const averageRunDistance =
    numberOfRuns > 0 ? totalMiles / numberOfRuns : 0;

  const mileageScore = Math.min((totalMiles / 35) * 30, 30);

  const longRunScore = Math.min((longestRun / 14) * 25, 25);

  const consistencyScore = Math.min((numberOfRuns / 5) * 20, 20);

  const workoutScore = hasHardWorkout ? 15 : 7;

  const enduranceBalanceScore =
    averageRunDistance > 0 && longestRun <= averageRunDistance * 3
      ? 10
      : 6;

  const totalScore =
    mileageScore +
    longRunScore +
    consistencyScore +
    workoutScore +
    enduranceBalanceScore;

  return Math.round(Math.min(totalScore, 100));
}

// Riegel's formula estimates race time when converting from one distance to another.
function convertMinutesToRaceTime(totalMinutes: number) {
  const totalSeconds = Math.round(totalMinutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const remainingSeconds = totalSeconds % 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function predictRaceTime(
  knownDistanceMiles: number,
  knownTimeMinutes: number,
  goalDistanceMiles: number
) {
  const fatigueFactor = 1.06;

  return knownTimeMinutes * Math.pow(goalDistanceMiles / knownDistanceMiles, fatigueFactor);
}

function convertRaceDistanceToMiles(raceDistance: string) {
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
function getRunTimeMs(run: Run) {
  return new Date(`${run.date}T00:00:00`).getTime();
}

function getTrainingWeeks(runs: Run[]) {
  if (runs.length < 2) {
    return 1;
  }

  const runTimes = runs.map(getRunTimeMs);
  const firstRunTime = Math.min(...runTimes);
  const lastRunTime = Math.max(...runTimes);
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const spanDays =
    Math.round((lastRunTime - firstRunTime) / millisecondsPerDay) + 1;

  return Math.max(1, spanDays / 7);
}

function getWindowRuns(runs: Run[], windowDays: number) {
  if (runs.length === 0) {
    return [];
  }

  const latestRunTime = Math.max(...runs.map(getRunTimeMs));
  const windowStart = latestRunTime - (windowDays - 1) * 24 * 60 * 60 * 1000;

  return runs.filter((run) => {
    const runTime = getRunTimeMs(run);

    return runTime >= windowStart && runTime <= latestRunTime;
  });
}

function formatDateForPoint(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Effort and heart-rate multipliers turn distance into a rough stress score.
// This is not a lab-grade TSS model; it gives the dashboard a consistent signal.
function getEffortMultiplier(run: Run) {
  if (run.effort === "Hard") {
    return 1.35;
  }

  if (run.effort === "Moderate") {
    return 1.15;
  }

  return 1;
}

function getHeartRateMultiplier(run: Run) {
  if (!run.averageHeartRate || !run.maxHeartRate) {
    return 1;
  }

  const heartRateRatio = run.averageHeartRate / run.maxHeartRate;

  if (heartRateRatio >= 0.9) {
    return 1.25;
  }

  if (heartRateRatio >= 0.82) {
    return 1.15;
  }

  if (heartRateRatio >= 0.75) {
    return 1.08;
  }

  return 1;
}

export function calculateRunTrainingStress(run: Run) {
  return run.distanceMiles * getEffortMultiplier(run) * getHeartRateMultiplier(run);
}

export function convertRaceTimeToMinutes(raceTime: string) {
  const rawParts = raceTime.trim().split(":");

  if (rawParts.length !== 2 && rawParts.length !== 3) {
    return 0;
  }

  const hasEmptyPart = rawParts.some((part) => part.trim() === "");

  if (hasEmptyPart) {
    return 0;
  }

  const timeParts = rawParts.map(Number);

  const hasInvalidNumber = timeParts.some(
    (part) => !Number.isFinite(part) || part < 0 || !Number.isInteger(part)
  );

  if (hasInvalidNumber) {
    return 0;
  }

  if (timeParts.length === 2) {
    const [minutes, seconds] = timeParts;

    if (seconds >= 60) {
      return 0;
    }

    return minutes + seconds / 60;
  }

  if (timeParts.length === 3) {
    const [hours, minutes, seconds] = timeParts;

    if (minutes >= 60 || seconds >= 60) {
      return 0;
    }

    return hours * 60 + minutes + seconds / 60;
  }

  return 0;
}

export function calculateRacePredictions(
  runs: Run[],
  pastRaceDistance: string,
  pastRaceTime: string,
  weeksUntilGoalRace = 0
) {
  const recentEffortDistanceMiles = convertRaceDistanceToMiles(pastRaceDistance);
  const recentEffortTimeMinutes = convertRaceTimeToMinutes(pastRaceTime);

  const totalMiles = calculateTotalMiles(runs);
  const longestRun = calculateLongestRun(runs);
  const numberOfRuns = calculateNumberOfRuns(runs);
  const trainingWeeks = getTrainingWeeks(runs);
  const averageWeeklyMiles = totalMiles / trainingWeeks;
  const averageWeeklyRuns = numberOfRuns / trainingWeeks;
  const hasTimeToBuild = weeksUntilGoalRace >= 8;
  const penaltyWeight = hasTimeToBuild ? 0.4 : 1;

  function applyPenalty(minutes: number, penalty: number) {
    return minutes * (1 + (penalty - 1) * penaltyWeight);
  }

  const fiveKMinutes = predictRaceTime(
    recentEffortDistanceMiles,
    recentEffortTimeMinutes,
    3.1
  );

  let tenKMinutes = predictRaceTime(
    recentEffortDistanceMiles,
    recentEffortTimeMinutes,
    6.2
  );

  let halfMarathonMinutes = predictRaceTime(
    recentEffortDistanceMiles,
    recentEffortTimeMinutes,
    13.1
  );

  let marathonMinutes = predictRaceTime(
    recentEffortDistanceMiles,
    recentEffortTimeMinutes,
    26.2
  );

  if (averageWeeklyMiles < 20) {
    halfMarathonMinutes = applyPenalty(halfMarathonMinutes, 1.08);
    marathonMinutes = applyPenalty(marathonMinutes, 1.15);
  }

  if (averageWeeklyMiles >= 20 && averageWeeklyMiles < 35) {
    halfMarathonMinutes = applyPenalty(halfMarathonMinutes, 1.03);
    marathonMinutes = applyPenalty(marathonMinutes, 1.08);
  }

  if (longestRun < 8) {
    halfMarathonMinutes = applyPenalty(halfMarathonMinutes, 1.05);
    marathonMinutes = applyPenalty(marathonMinutes, 1.15);
  }

  if (longestRun >= 8 && longestRun < 14) {
    marathonMinutes = applyPenalty(marathonMinutes, 1.08);
  }

  if (averageWeeklyRuns < 4) {
    tenKMinutes = applyPenalty(tenKMinutes, 1.02);
    halfMarathonMinutes = applyPenalty(halfMarathonMinutes, 1.04);
    marathonMinutes = applyPenalty(marathonMinutes, 1.06);
  }

  return {
    fiveK: convertMinutesToRaceTime(fiveKMinutes),
    tenK: convertMinutesToRaceTime(tenKMinutes),
    halfMarathon: convertMinutesToRaceTime(halfMarathonMinutes),
    marathon: convertMinutesToRaceTime(marathonMinutes),
  };
}

// These labels are used by the summary card to keep the explanation readable.
export function calculateFitnessBreakdown(runs: Run[]) {
  const totalMiles = calculateTotalMiles(runs);
  const longestRun = calculateLongestRun(runs);
  const numberOfRuns = calculateNumberOfRuns(runs);

  return {
    mileage: totalMiles >= 55 ? "Strong" : totalMiles >= 25 ? "Moderate" : "Needs work",
    longRun: longestRun >= 15 ? "Strong" : longestRun >= 10 ? "Moderate" : "Needs work",
    consistency:
      numberOfRuns >= 6 ? "Strong" : numberOfRuns >= 3 ? "Moderate" : "Needs work",
  };

  
}

// This older load label is kept for summaries that only need Low/Moderate/High.
export function calculateTrainingLoad(runs: Run[]) {
  const totalMiles = calculateTotalMiles(runs);

  if (totalMiles >= 55) {
    return "High";
  }

  if (totalMiles >= 35) {
    return "Moderate";
  }

  return "Low";
}

export function calculateTrainingLoadMetrics(runs: Run[]): TrainingLoadMetrics {
  // Acute load = recent fatigue. Chronic load = longer baseline fitness.
  const acuteRuns = getWindowRuns(runs, 7);
  const chronicRuns = getWindowRuns(runs, 42);
  const acuteLoad = acuteRuns.reduce(
    (sum, run) => sum + calculateRunTrainingStress(run),
    0
  );
  const chronicLoad =
    chronicRuns.reduce((sum, run) => sum + calculateRunTrainingStress(run), 0) / 6;
  const roundedAcuteLoad = Math.round(acuteLoad);
  const roundedChronicLoad = Math.round(chronicLoad);
  const form = Math.round(chronicLoad - acuteLoad);
  const rampRate =
    chronicLoad > 0 ? Math.round(((acuteLoad - chronicLoad) / chronicLoad) * 100) : 0;
  let status: TrainingLoadMetrics["status"] = "Low";
  let explanation = "There is not enough recent training load to judge a trend yet.";

  if (roundedChronicLoad >= 10) {
    if (rampRate > 35) {
      status = "Overreaching";
      explanation =
        "Your last 7 days are much heavier than your 6-week baseline, so fatigue risk is elevated.";
    } else if (rampRate >= 10) {
      status = "Building";
      explanation =
        "Your last 7 days are above your 6-week baseline, which usually means you are building fitness.";
    } else if (rampRate <= -25) {
      status = "Fresh";
      explanation =
        "Your last 7 days are lighter than your 6-week baseline, so you should be carrying less fatigue.";
    } else {
      status = "Maintaining";
      explanation =
        "Your last 7 days are close to your 6-week baseline, which usually means steady training.";
    }
  }

  return {
    acuteLoad: roundedAcuteLoad,
    chronicLoad: roundedChronicLoad,
    form,
    rampRate,
    status,
    explanation,
  };
}

export function calculateTrainingLoadTimeline(
  runs: Run[],
  numberOfWeeks = 8
): TrainingLoadTimelinePoint[] {
  if (runs.length === 0) {
    return [];
  }

  const latestRunTime = Math.max(...runs.map(getRunTimeMs));
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  // Build one weekly snapshot per chart column, moving from oldest to newest.
  return Array.from({ length: numberOfWeeks }, (_, index) => {
    const weeksBack = numberOfWeeks - 1 - index;
    const pointDate = new Date(latestRunTime - weeksBack * 7 * millisecondsPerDay);
    const pointDateString = formatDateForPoint(pointDate);
    const pointRuns = runs.filter((run) => getRunTimeMs(run) <= pointDate.getTime());
    const recentRuns = getWindowRuns(pointRuns, 7);

    return {
      date: pointDateString,
      totalMiles: Number(calculateTotalMiles(recentRuns).toFixed(1)),
      ...calculateTrainingLoadMetrics(pointRuns),
    };
  });
}
