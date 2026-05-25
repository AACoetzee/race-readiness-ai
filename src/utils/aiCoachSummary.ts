type AICoachSummaryInput = {
  totalMiles: number;
  longestRun: number;
  numberOfRuns: number;
  fitnessScore: number;
  trainingLoad: string;
  goalRace: string;
  selectedGoalTime: string;
};

export function generateAICoachSummary({
  totalMiles,
  longestRun,
  numberOfRuns,
  fitnessScore,
  trainingLoad,
  goalRace,
  selectedGoalTime,
}: AICoachSummaryInput) {
  const strengths: string[] = [];
  const risks: string[] = [];
  const suggestions: string[] = [];

  if (totalMiles >= 50) {
    strengths.push("You have a solid weekly mileage base.");
  } else {
    risks.push("Your weekly mileage is still fairly low.");
    suggestions.push("Build mileage slowly before targeting longer races.");
  }

  if (longestRun >= 13) {
    strengths.push("Your long run shows good endurance.");
  } else {
    risks.push("Your long run is still short for longer race goals.");
    suggestions.push("Increase your long run gradually over time.");
  }

  if (numberOfRuns >= 5) {
    strengths.push("You are running consistently.");
  } else {
    risks.push("Your running frequency is a little low.");
    suggestions.push("Try to build toward 4 runs per week.");
  }

  if (goalRace === "Marathon" && longestRun < 15) {
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

    summary: `Based on ${totalMiles} miles this week, ${numberOfRuns} runs, and a longest run of ${longestRun} miles, your current training load looks ${trainingLoad.toLowerCase()}. Your estimated ${goalRace} time is ${selectedGoalTime}.`,

    strengths,
    risks,
    suggestions,
  };
}