type AICoachSummaryInput = {
  totalMiles: number;
  longestRun: number;
  numberOfRuns: number;
  fitnessScore: number;
  trainingLoad: string;
  trainingStatus: string;
  trendAverageWeeklyMiles: number;
  trendLongestRun: number;
  trendAverageWeeklyRuns: number;
  goalRace: string;
  selectedGoalTime: string;
};

export function generateAICoachSummary({
  totalMiles,
  longestRun,
  numberOfRuns,
  fitnessScore,
  trainingLoad,
  trainingStatus,
  trendAverageWeeklyMiles,
  trendLongestRun,
  trendAverageWeeklyRuns,
  goalRace,
  selectedGoalTime,
}: AICoachSummaryInput) {
  // This is a fast local summary, not an OpenAI call. It gives the dashboard a
  // useful answer immediately and acts as a fallback when the backend is offline.
  const strengths: string[] = [];
  const risks: string[] = [];
  const suggestions: string[] = [];

  // Use the longer trend for strengths so one unusual week does not erase them.
  if (trendAverageWeeklyMiles >= 30) {
    strengths.push(`Your 90-day mileage base is strong at ${trendAverageWeeklyMiles.toFixed(1)} mi/wk.`);
  } else if (trendAverageWeeklyMiles >= 20) {
    strengths.push(`You have a solid 90-day mileage base of ${trendAverageWeeklyMiles.toFixed(1)} mi/wk.`);
  } else {
    risks.push("Your 90-day weekly mileage base is still fairly low.");
    suggestions.push("Build mileage slowly before targeting longer races.");
  }

  if (trendLongestRun >= 13) {
    strengths.push(`Your ${trendLongestRun.toFixed(1)}-mile long run shows good endurance.`);
  } else if (trendLongestRun >= 9) {
    strengths.push("Your recent long-run history gives you a useful endurance base.");
  } else {
    risks.push("Your long run is still short for longer race goals.");
    suggestions.push("Increase your long run gradually over time.");
  }

  if (trendAverageWeeklyRuns >= 4) {
    strengths.push(`You are consistently averaging ${trendAverageWeeklyRuns.toFixed(1)} runs per week.`);
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
    suggestions.push("Focus on endurance, steady mileage, and long runs.");
  }

  return {
    headline:
      fitnessScore >= 85
        ? "You look fit and consistent right now."
        : fitnessScore >= 70
        ? "You have a good base, but there is room to improve."
        : "You are still building your running base.",

    summary: `Based on ${totalMiles} miles in your most recent 7-day training window, ${numberOfRuns} runs, and a longest run of ${longestRun} miles, your current training load looks ${trainingLoad.toLowerCase()}. Your estimated ${goalRace} time is ${selectedGoalTime}.`,

    strengths,
    risks,
    suggestions,
  };
}
