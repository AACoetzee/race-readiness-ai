type AICoachSummaryInput = {
  totalMiles: number;
  longestRun: number;
  numberOfRuns: number;
  fitnessScore: number;
  trainingStatus: string;
  trendAverageWeeklyMiles: number;
  trendLongestRun: number;
  trendAverageWeeklyRuns: number;
  goalRace: string;
  selectedGoalTime: string;
  distanceUnit: "mi" | "km";
};

export function generateAICoachSummary({
  totalMiles,
  longestRun,
  numberOfRuns,
  fitnessScore,
  trainingStatus,
  trendAverageWeeklyMiles,
  trendLongestRun,
  trendAverageWeeklyRuns,
  goalRace,
  selectedGoalTime,
  distanceUnit,
}: AICoachSummaryInput) {
  // This is a fast local summary, not an OpenAI call. It gives the dashboard a
  // useful answer immediately and acts as a fallback when the backend is offline.
  const strengths: string[] = [];
  const risks: string[] = [];
  const suggestions: string[] = [];
  const formatDistance = (miles: number) =>
    distanceUnit === "km"
      ? `${(miles * 1.609344).toFixed(1)} km (${miles.toFixed(1)} mi)`
      : `${miles.toFixed(1)} mi (${(miles * 1.609344).toFixed(1)} km)`;

  // Use the longer trend for strengths so one unusual week does not erase them.
  if (trendAverageWeeklyMiles >= 30) {
    strengths.push(`Your 90-day distance base is strong at ${formatDistance(trendAverageWeeklyMiles)}/wk.`);
  } else if (trendAverageWeeklyMiles >= 20) {
    strengths.push(`You have a solid 90-day distance base of ${formatDistance(trendAverageWeeklyMiles)}/wk.`);
  } else {
    risks.push("Your 90-day weekly distance base is still fairly low.");
    suggestions.push("Build weekly distance slowly before targeting longer races.");
  }

  if (trendLongestRun >= 13) {
    strengths.push(
      `Your history includes a ${formatDistance(trendLongestRun)} non-race activity, which shows substantial endurance.`
    );
  } else if (trendLongestRun >= 9) {
    strengths.push("Your recent long-run history gives you a useful endurance base.");
  } else {
    risks.push("Your long run is still short for longer race goals.");
    suggestions.push("Increase your long run gradually over time.");
  }

  if (trendAverageWeeklyRuns >= 4 || numberOfRuns >= 4) {
    strengths.push(
      trendAverageWeeklyRuns >= 4
        ? `You are consistently averaging ${trendAverageWeeklyRuns.toFixed(1)} runs per week.`
        : `You completed ${numberOfRuns} runs in the latest week, which is a useful training frequency.`
    );
  } else {
    risks.push("Your running frequency is a little low.");
    suggestions.push("Try to build toward 4 runs per week.");
  }

  if (trainingStatus === "Building") {
    strengths.push("Your recent training load shows that you are building fitness.");
  } else if (trainingStatus === "Maintaining") {
    strengths.push("Your recent training load is steady and consistent.");
  }

  if (goalRace === "Marathon" && trendLongestRun < 15) {
    risks.push("The marathon estimate is less reliable because the long run is not very long yet.");
    suggestions.push("Add more long-run history before trusting the marathon prediction.");
  }

  if (goalRace === "5K" || goalRace === "10K") {
    suggestions.push("Add one faster workout each week to improve speed.");
  }

  if (goalRace === "Half Marathon" || goalRace === "Marathon") {
    suggestions.push("Focus on endurance, steady weekly distance, and long runs.");
  }

  return {
    headline:
      fitnessScore >= 85 || (trendAverageWeeklyMiles >= 25 && trainingStatus !== "Low")
        ? "You look fit and consistent right now."
        : fitnessScore >= 70
        ? "You have a good base, but there is room to improve."
        : "You are still building your running base.",

    summary: `Your most recent 7-day window contains ${formatDistance(totalMiles)} across ${numberOfRuns} runs, with a ${formatDistance(longestRun)} longest run. Compared with your longer-term training, your current status is ${trainingStatus.toLowerCase()}. Your current ${goalRace} capability estimate is ${selectedGoalTime}.`,

    strengths,
    risks,
    suggestions,
  };
}
