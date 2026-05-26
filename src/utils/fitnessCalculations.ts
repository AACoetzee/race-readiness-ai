import type { Run } from "../data/sampleRuns";

//Calculate total miles
export function calculateTotalMiles(runs: Run[]) {
  return runs.reduce((sum, run) => {
    return sum + run.distanceMiles;
  }, 0);
}

//calculate longest run
export function calculateLongestRun(runs: Run[]) {
  if (runs.length === 0) {
    return 0;
  }

  return Math.max(...runs.map((run) => run.distanceMiles));
}

//calculate number of runs
export function calculateNumberOfRuns(runs: Run[]) {
  return runs.length;
}

//calculate fitness score
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

//calculate race predictions Riegel Formula
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

//

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
//

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

//

export function calculateRacePredictions(
  runs: Run[],
  pastRaceDistance: string,
  pastRaceTime: string
) {
  const recentEffortDistanceMiles = convertRaceDistanceToMiles(pastRaceDistance);
  const recentEffortTimeMinutes = convertRaceTimeToMinutes(pastRaceTime);

  const totalMiles = calculateTotalMiles(runs);
  const longestRun = calculateLongestRun(runs);
  const numberOfRuns = calculateNumberOfRuns(runs);

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

  if (totalMiles < 20) {
    halfMarathonMinutes *= 1.08;
    marathonMinutes *= 1.15;
  }

  if (totalMiles >= 20 && totalMiles < 35) {
    halfMarathonMinutes *= 1.03;
    marathonMinutes *= 1.08;
  }

  if (longestRun < 8) {
    halfMarathonMinutes *= 1.05;
    marathonMinutes *= 1.15;
  }

  if (longestRun >= 8 && longestRun < 14) {
    marathonMinutes *= 1.08;
  }

  if (numberOfRuns < 4) {
    tenKMinutes *= 1.02;
    halfMarathonMinutes *= 1.04;
    marathonMinutes *= 1.06;
  }

  return {
    fiveK: convertMinutesToRaceTime(fiveKMinutes),
    tenK: convertMinutesToRaceTime(tenKMinutes),
    halfMarathon: convertMinutesToRaceTime(halfMarathonMinutes),
    marathon: convertMinutesToRaceTime(marathonMinutes),
  };
}

//fitness breakdown

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

//Calculate training load
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

//Select goal time
