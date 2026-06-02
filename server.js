import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";
const STRAVA_REDIRECT_URI =
  process.env.STRAVA_REDIRECT_URI ||
  `http://localhost:${PORT}/api/strava/callback`;
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const aiSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "aiAdjustedGoalTime",
    "confidence",
    "dateAssessment",
    "strengths",
    "risks",
    "suggestions",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    aiAdjustedGoalTime: { type: "string" },
    confidence: { type: "string", enum: ["Low", "Medium", "High"] },
    dateAssessment: { type: "string" },
    strengths: {
      type: "array",
      items: { type: "string" },
    },
    risks: {
      type: "array",
      items: { type: "string" },
    },
    suggestions: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const trainingPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "overview",
    "confidence",
    "whyThisPlan",
    "heartRateGuidance",
    "assumptions",
    "weeks",
  ],
  properties: {
    title: { type: "string" },
    overview: { type: "string" },
    confidence: { type: "string", enum: ["Low", "Medium", "High"] },
    whyThisPlan: {
      type: "array",
      items: { type: "string" },
    },
    heartRateGuidance: {
      type: "array",
      items: { type: "string" },
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
    weeks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "week",
          "phase",
          "targetMiles",
          "longRunMiles",
          "workoutFocus",
          "easyRunGuidance",
          "notes",
        ],
        properties: {
          week: { type: "integer" },
          phase: { type: "string" },
          targetMiles: { type: "number" },
          longRunMiles: { type: "number" },
          workoutFocus: { type: "string" },
          easyRunGuidance: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
};

const coachInsightSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "whatChanged", "nextMove", "watchOut"],
  properties: {
    headline: { type: "string" },
    whatChanged: { type: "string" },
    nextMove: { type: "string" },
    watchOut: { type: "string" },
  },
};

const fallbackSummary = {
  headline: "AI summary is unavailable right now.",
  summary: "The app could not generate an AI summary. Try again later.",
  aiAdjustedGoalTime: "Unavailable",
  confidence: "Unknown",
  dateAssessment: "No date assessment is available.",
  strengths: [],
  risks: [],
  suggestions: [],
};

const fallbackTrainingPlan = {
  title: "Training plan unavailable",
  overview: "The app could not generate an AI training plan. Try again later.",
  confidence: "Low",
  whyThisPlan: [],
  heartRateGuidance: [],
  assumptions: [],
  weeks: [],
};

const fallbackCoachInsight = {
  headline: "Coach check-in is unavailable right now.",
  whatChanged: "The app could not generate a training check-in.",
  nextMove: "Use the dashboard load trend and recent run list as your guide for now.",
  watchOut: "Try again later if the AI backend is unavailable.",
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: "100kb" }));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

function metersToMiles(meters) {
  return meters / 1609.344;
}

function metersToFeet(meters) {
  return meters * 3.28084;
}

function formatPace(minutesPerMile) {
  const totalSeconds = Math.round(minutesPerMile * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /mi`;
}

function estimateEffort(activity, observedMaxHeartRate) {
  const activityName = String(activity.name || "").toLowerCase();

  // Prefer Strava tags and workout-like names over heart-rate guesses.
  // Run-level max HR is noisy, so HR alone should not create a Hard label.
  if (activity.workout_type === 1 || activity.workout_type === 3) {
    return "Hard";
  }

  if (
    /\b(race|time trial|tt|workout|interval|repeats|tempo|threshold|lt|track|fartlek|hill)\b/.test(
      activityName
    )
  ) {
    return "Hard";
  }

  if (activity.workout_type === 2 || /\b(long run|long)\b/.test(activityName)) {
    return "Moderate";
  }

  if (/\b(easy|recovery|shakeout|warmup|cooldown)\b/.test(activityName)) {
    return "Easy";
  }

  if (activity.average_heartrate && observedMaxHeartRate) {
    const heartRateRatio = activity.average_heartrate / observedMaxHeartRate;

    if (heartRateRatio >= 0.78) {
      return "Moderate";
    }
  }

  return "Easy";
}

function getRaceDistance(distanceMiles) {
  // Race-tagged Strava activities are mapped to common race distances when close enough.
  const raceDistances = [
    { label: "5K", miles: 3.10686 },
    { label: "10K", miles: 6.21371 },
    { label: "Half Marathon", miles: 13.1094 },
    { label: "Marathon", miles: 26.2188 },
  ];
  const closest = raceDistances.reduce((best, raceDistance) => {
    const bestDifference = Math.abs(distanceMiles - best.miles);
    const currentDifference = Math.abs(distanceMiles - raceDistance.miles);

    return currentDifference < bestDifference ? raceDistance : best;
  });

  return Math.abs(distanceMiles - closest.miles) <= 1 ? closest.label : undefined;
}

function mapStravaActivityToRun(activity, observedMaxHeartRate) {
  const distanceMiles = metersToMiles(activity.distance);
  const movingTimeMinutes = activity.moving_time / 60;
  const paceMinutesPerMile =
    distanceMiles > 0 ? movingTimeMinutes / distanceMiles : 0;
  const isRace = activity.workout_type === 1;

  return {
    date: activity.start_date_local.slice(0, 10),
    type: activity.name || activity.type || "Strava Run",
    distanceMiles: Number(distanceMiles.toFixed(2)),
    pace: formatPace(paceMinutesPerMile),
    effort: estimateEffort(activity, observedMaxHeartRate),
    elapsedTimeSeconds: isRace ? activity.elapsed_time : activity.moving_time,
    movingTimeSeconds: activity.moving_time,
    averageHeartRate: activity.average_heartrate,
    maxHeartRate: activity.max_heartrate,
    elevationGainFeet: activity.total_elevation_gain
      ? Number(metersToFeet(activity.total_elevation_gain).toFixed(0))
      : undefined,
    averageCadence: activity.average_cadence,
    isRace,
    raceDistance: isRace ? getRaceDistance(distanceMiles) : undefined,
    source: "Strava",
    stravaActivityId: activity.id,
    stravaWorkoutType: activity.workout_type,
  };
}

function validateStravaConfig() {
  const missing = [
    ["STRAVA_CLIENT_ID", process.env.STRAVA_CLIENT_ID],
    ["STRAVA_CLIENT_SECRET", process.env.STRAVA_CLIENT_SECRET],
    ["STRAVA_REFRESH_TOKEN", process.env.STRAVA_REFRESH_TOKEN],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return missing;
}

function validateStravaOAuthConfig() {
  const missing = [
    ["STRAVA_CLIENT_ID", process.env.STRAVA_CLIENT_ID],
    ["STRAVA_CLIENT_SECRET", process.env.STRAVA_CLIENT_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return missing;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function convertRaceTimeToMinutes(raceTime) {
  if (!isNonEmptyString(raceTime)) {
    return 0;
  }

  const parts = raceTime.split(":").map(Number);

  if (
    ![2, 3].includes(parts.length) ||
    parts.some((part) => !Number.isFinite(part) || part < 0)
  ) {
    return 0;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;

    return minutes + seconds / 60;
  }

  const [hours, minutes, seconds] = parts;

  return hours * 60 + minutes + seconds / 60;
}

function convertMinutesToRaceTime(totalMinutes) {
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

function constrainAdjustedGoalTime(summary, context) {
  const formulaMinutes = convertRaceTimeToMinutes(context.selectedGoalTime);
  const adjustedMinutes = convertRaceTimeToMinutes(summary.aiAdjustedGoalTime);

  if (formulaMinutes <= 0 || adjustedMinutes <= 0) {
    return summary;
  }

  const hasRecentRaceAnchor = context.weeksSincePastRace <= 12;
  const hasTimeToTrain = context.weeksUntilGoalRace >= 8;
  const hasReasonableBase = context.trendAverageWeeklyMiles >= 20;

  if (!hasRecentRaceAnchor || !hasTimeToTrain || !hasReasonableBase) {
    return summary;
  }

  const maxAllowedSlowdown = formulaMinutes * 1.03;

  if (adjustedMinutes <= maxAllowedSlowdown) {
    return summary;
  }

  return {
    ...summary,
    aiAdjustedGoalTime: convertMinutesToRaceTime(maxAllowedSlowdown),
    confidence: summary.confidence === "Low" ? "Medium" : summary.confidence,
  };
}

async function getStravaAccessToken() {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Could not refresh Strava access token.");
  }

  return data.access_token;
}

async function exchangeStravaCodeForTokens(code) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Could not exchange Strava code.");
  }

  return data;
}

async function getStravaActivities(accessToken, perPage) {
  const params = new URLSearchParams({
    page: "1",
    per_page: String(perPage),
  });
  const response = await fetch(`${STRAVA_ACTIVITIES_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const details = Array.isArray(data.errors)
      ? data.errors
          .map((error) => `${error.field || error.resource}: ${error.code}`)
          .join(", ")
      : "";

    throw new Error(
      [data.message || "Could not fetch Strava activities.", details]
        .filter(Boolean)
        .join(" ")
    );
  }

  return data;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateString(value) {
  if (!isNonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function validateAiSummaryRequest(body) {
  const errors = [];
  const validGoalRaces = ["5K", "10K", "Half Marathon", "Marathon"];
  const validTrainingLoads = ["Low", "Moderate", "High"];

  if (!isFiniteNumber(body.totalMiles) || body.totalMiles < 0) {
    errors.push("totalMiles must be a non-negative number.");
  }

  if (!isFiniteNumber(body.longestRun) || body.longestRun < 0) {
    errors.push("longestRun must be a non-negative number.");
  }

  if (
    !Number.isInteger(body.numberOfRuns) ||
    body.numberOfRuns < 0 ||
    body.numberOfRuns > 21
  ) {
    errors.push("numberOfRuns must be a reasonable non-negative integer.");
  }

  if (
    !isFiniteNumber(body.fitnessScore) ||
    body.fitnessScore < 0 ||
    body.fitnessScore > 100
  ) {
    errors.push("fitnessScore must be a number between 0 and 100.");
  }

  if (
    !Number.isInteger(body.trendWindowDays) ||
    body.trendWindowDays < 30 ||
    body.trendWindowDays > 120
  ) {
    errors.push("trendWindowDays must be an integer between 30 and 120.");
  }

  if (!isFiniteNumber(body.trendTotalMiles) || body.trendTotalMiles < 0) {
    errors.push("trendTotalMiles must be a non-negative number.");
  }

  if (!isFiniteNumber(body.trendLongestRun) || body.trendLongestRun < 0) {
    errors.push("trendLongestRun must be a non-negative number.");
  }

  if (!Number.isInteger(body.trendNumberOfRuns) || body.trendNumberOfRuns < 0) {
    errors.push("trendNumberOfRuns must be a non-negative integer.");
  }

  if (
    !isFiniteNumber(body.trendAverageWeeklyMiles) ||
    body.trendAverageWeeklyMiles < 0
  ) {
    errors.push("trendAverageWeeklyMiles must be a non-negative number.");
  }

  if (!validTrainingLoads.includes(body.trainingLoad)) {
    errors.push("trainingLoad must be Low, Moderate, or High.");
  }

  if (!validGoalRaces.includes(body.goalRace)) {
    errors.push("goalRace must be 5K, 10K, Half Marathon, or Marathon.");
  }

  if (!validGoalRaces.includes(body.pastRaceDistance)) {
    errors.push("pastRaceDistance must be 5K, 10K, Half Marathon, or Marathon.");
  }

  if (!isNonEmptyString(body.selectedGoalTime)) {
    errors.push("selectedGoalTime is required.");
  }

  if (!isNonEmptyString(body.pastRaceTime)) {
    errors.push("pastRaceTime is required.");
  }

  if (!isNonEmptyString(body.raceDataSource)) {
    errors.push("raceDataSource is required.");
  }

  if (!isValidDateString(body.pastRaceDate)) {
    errors.push("pastRaceDate must use YYYY-MM-DD format.");
  }

  if (!isValidDateString(body.currentDate)) {
    errors.push("currentDate must use YYYY-MM-DD format.");
  }

  if (!Number.isInteger(body.daysSincePastRace) || body.daysSincePastRace < 0) {
    errors.push("daysSincePastRace must be a non-negative integer.");
  }

  if (!Number.isInteger(body.weeksSincePastRace) || body.weeksSincePastRace < 0) {
    errors.push("weeksSincePastRace must be a non-negative integer.");
  }

  if (!isValidDateString(body.goalRaceDate)) {
    errors.push("goalRaceDate must use YYYY-MM-DD format.");
  }

  if (!Number.isInteger(body.weeksUntilGoalRace) || body.weeksUntilGoalRace < 0) {
    errors.push("weeksUntilGoalRace must be a non-negative integer.");
  }

  return errors;
}

function isValidRun(value) {
  return (
    value &&
    typeof value === "object" &&
    isValidDateString(value.date) &&
    isNonEmptyString(value.type) &&
    isFiniteNumber(value.distanceMiles) &&
    value.distanceMiles > 0 &&
    isNonEmptyString(value.pace) &&
    ["Easy", "Moderate", "Hard"].includes(value.effort) &&
    (value.elapsedTimeSeconds === undefined ||
      (isFiniteNumber(value.elapsedTimeSeconds) && value.elapsedTimeSeconds > 0)) &&
    (value.movingTimeSeconds === undefined ||
      (isFiniteNumber(value.movingTimeSeconds) && value.movingTimeSeconds > 0)) &&
    (value.averageHeartRate === undefined ||
      (isFiniteNumber(value.averageHeartRate) && value.averageHeartRate > 0)) &&
    (value.maxHeartRate === undefined ||
      (isFiniteNumber(value.maxHeartRate) && value.maxHeartRate > 0)) &&
    (value.elevationGainFeet === undefined ||
      isFiniteNumber(value.elevationGainFeet)) &&
    (value.averageCadence === undefined ||
      isFiniteNumber(value.averageCadence)) &&
    (value.stravaActivityId === undefined ||
      isFiniteNumber(value.stravaActivityId)) &&
    (value.isRace === undefined || typeof value.isRace === "boolean") &&
    (value.raceDistance === undefined ||
      ["5K", "10K", "Half Marathon", "Marathon"].includes(value.raceDistance))
  );
}

function validateTrainingPlanRequest(body) {
  const errors = [];
  const validGoalRaces = ["5K", "10K", "Half Marathon", "Marathon"];

  if (!validGoalRaces.includes(body.goalRace)) {
    errors.push("goalRace must be 5K, 10K, Half Marathon, or Marathon.");
  }

  if (!isValidDateString(body.goalRaceDate)) {
    errors.push("goalRaceDate must use YYYY-MM-DD format.");
  }

  if (!isValidDateString(body.currentDate)) {
    errors.push("currentDate must use YYYY-MM-DD format.");
  }

  if (!Number.isInteger(body.weeksUntilGoalRace) || body.weeksUntilGoalRace < 0) {
    errors.push("weeksUntilGoalRace must be a non-negative integer.");
  }

  if (
    !isFiniteNumber(body.trendAverageWeeklyMiles) ||
    body.trendAverageWeeklyMiles < 0
  ) {
    errors.push("trendAverageWeeklyMiles must be a non-negative number.");
  }

  if (!isFiniteNumber(body.trendLongestRun) || body.trendLongestRun < 0) {
    errors.push("trendLongestRun must be a non-negative number.");
  }

  if (!Number.isInteger(body.trendNumberOfRuns) || body.trendNumberOfRuns < 0) {
    errors.push("trendNumberOfRuns must be a non-negative integer.");
  }

  if (!isNonEmptyString(body.selectedGoalTime)) {
    errors.push("selectedGoalTime is required.");
  }

  if (!isNonEmptyString(body.raceDataSource)) {
    errors.push("raceDataSource is required.");
  }

  if (!Array.isArray(body.trendRuns) || body.trendRuns.length === 0) {
    errors.push("trendRuns must include at least one run.");
  } else if (!body.trendRuns.every(isValidRun)) {
    errors.push("trendRuns contains invalid run data.");
  }

  return errors;
}

function validateAiSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return false;
  }

  return (
    isNonEmptyString(summary.headline) &&
    isNonEmptyString(summary.summary) &&
    isNonEmptyString(summary.aiAdjustedGoalTime) &&
    ["Low", "Medium", "High"].includes(summary.confidence) &&
    isNonEmptyString(summary.dateAssessment) &&
    Array.isArray(summary.strengths) &&
    summary.strengths.every(isNonEmptyString) &&
    Array.isArray(summary.risks) &&
    summary.risks.every(isNonEmptyString) &&
    Array.isArray(summary.suggestions) &&
    summary.suggestions.every(isNonEmptyString)
  );
}

function validateTrainingPlan(plan, weeksUntilGoalRace) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return false;
  }

  const maxWeeks = Math.min(Math.max(weeksUntilGoalRace, 1), 24);

  return (
    isNonEmptyString(plan.title) &&
    isNonEmptyString(plan.overview) &&
    ["Low", "Medium", "High"].includes(plan.confidence) &&
    Array.isArray(plan.whyThisPlan) &&
    plan.whyThisPlan.every(isNonEmptyString) &&
    Array.isArray(plan.heartRateGuidance) &&
    plan.heartRateGuidance.every(isNonEmptyString) &&
    Array.isArray(plan.assumptions) &&
    plan.assumptions.every(isNonEmptyString) &&
    Array.isArray(plan.weeks) &&
    plan.weeks.length > 0 &&
    plan.weeks.length <= maxWeeks &&
    plan.weeks.every(
      (week, index) =>
        week &&
        typeof week === "object" &&
        week.week === index + 1 &&
        isNonEmptyString(week.phase) &&
        isFiniteNumber(week.targetMiles) &&
        week.targetMiles >= 0 &&
        isFiniteNumber(week.longRunMiles) &&
        week.longRunMiles >= 0 &&
        isNonEmptyString(week.workoutFocus) &&
        isNonEmptyString(week.easyRunGuidance) &&
        isNonEmptyString(week.notes)
    )
  );
}

function validateCoachInsight(insight) {
  if (!insight || typeof insight !== "object" || Array.isArray(insight)) {
    return false;
  }

  return (
    isNonEmptyString(insight.headline) &&
    isNonEmptyString(insight.whatChanged) &&
    isNonEmptyString(insight.nextMove) &&
    isNonEmptyString(insight.watchOut)
  );
}

function getTrainingPlanLongRunCap(goalRace) {
  if (goalRace === "Marathon") {
    return 20;
  }

  if (goalRace === "Half Marathon") {
    return 14;
  }

  if (goalRace === "10K") {
    return 8;
  }

  return 6;
}

function getObservedMaxHeartRate(activities) {
  const heartRates = activities.flatMap((activity) => [
    activity.max_heartrate,
    activity.average_heartrate,
  ]);
  const validHeartRates = heartRates.filter(
    (heartRate) => typeof heartRate === "number" && Number.isFinite(heartRate)
  );

  return validHeartRates.length > 0 ? Math.max(...validHeartRates) : null;
}

function normalizeTrainingPlan(plan, goalRace, trendAverageWeeklyMiles) {
  const longRunCap = getTrainingPlanLongRunCap(goalRace);
  const startingMileage = Math.max(10, trendAverageWeeklyMiles);
  let previousMileage = startingMileage;

  return {
    ...plan,
    weeks: plan.weeks.map((week) => {
      // Hard safety rails run after AI generation so the plan cannot jump wildly.
      const isCutbackWeek = week.week > 1 && week.week % 4 === 0;
      const maxMileage = isCutbackWeek
        ? previousMileage
        : Math.max(startingMileage, previousMileage * 1.15);
      const targetMiles = Math.max(
        0,
        Number(Math.min(week.targetMiles, maxMileage).toFixed(1))
      );
      const weeklyLongRunCap = Math.min(longRunCap, Math.max(3, targetMiles * 0.45));
      const longRunMiles = Math.max(
        0,
        Number(Math.min(week.longRunMiles, weeklyLongRunCap).toFixed(1))
      );
      previousMileage = targetMiles;

      return {
        ...week,
        targetMiles,
        longRunMiles,
      };
    }),
    assumptions: [
      ...plan.assumptions,
      `${goalRace} long runs are capped near ${longRunCap} miles; race-tagged activities inform fitness but are not treated as normal weekly long runs.`,
      `Weekly mileage starts from about ${trendAverageWeeklyMiles.toFixed(1)} miles per week based on the recent training trend.`,
      "Safety rules are applied after AI generation: weekly mileage jumps are capped, long runs are capped, and every fourth week is treated conservatively.",
    ].slice(0, 6),
  };
}

function sendFallbackSummary(res, status, summary) {
  res.status(status).json({
    ...fallbackSummary,
    ...summary,
  });
}

function sendFallbackTrainingPlan(res, status, plan) {
  res.status(status).json({
    ...fallbackTrainingPlan,
    ...plan,
  });
}

function sendFallbackCoachInsight(res, status, insight) {
  res.status(status).json({
    ...fallbackCoachInsight,
    ...insight,
  });
}

app.get("/api/strava/connect", (_req, res) => {
  const missingConfig = validateStravaOAuthConfig();

  if (missingConfig.length > 0) {
    res.status(503).send(`Missing Strava config: ${missingConfig.join(", ")}`);
    return;
  }

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: STRAVA_REDIRECT_URI,
    response_type: "code",
    approval_prompt: "force",
    scope: "read,activity:read_all",
  });

  res.redirect(`${STRAVA_AUTH_URL}?${params}`);
});

app.get("/api/strava/callback", async (req, res) => {
  const code = req.query.code;

  if (!isNonEmptyString(code)) {
    res.status(400).send("Missing Strava authorization code.");
    return;
  }

  try {
    const tokenData = await exchangeStravaCodeForTokens(code);
    const refreshToken = escapeHtml(tokenData.refresh_token);
    const scope = escapeHtml(tokenData.scope || "Scope was not returned.");
    const envLine = escapeHtml(`STRAVA_REFRESH_TOKEN=${tokenData.refresh_token}`);

    res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Strava Connected</title>
          <style>
            body {
              max-width: 760px;
              margin: 48px auto;
              padding: 0 24px;
              font-family: Arial, sans-serif;
              line-height: 1.5;
              color: #0f172a;
            }

            code {
              display: block;
              overflow-wrap: anywhere;
              padding: 16px;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              background: #f8fafc;
            }
          </style>
        </head>
        <body>
          <h1>Strava connected</h1>
          <p>Copy this full line into your local <strong>.env</strong> file, replacing the old <strong>STRAVA_REFRESH_TOKEN</strong> line.</p>
          <code>${envLine}</code>
          <p>Scope: ${scope}</p>
          <p>The scope must include <strong>activity:read</strong> or <strong>activity:read_all</strong>. If it does not, approve the Strava screen again and make sure activity access is checked.</p>
          <p>After saving <strong>.env</strong>, restart the backend server.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Could not finish Strava authorization.");
  }
});

app.get("/api/strava/runs", async (req, res) => {
  const missingConfig = validateStravaConfig();

  if (missingConfig.length > 0) {
    res.status(503).json({
      error: `Missing Strava config: ${missingConfig.join(", ")}`,
      runs: [],
    });
    return;
  }

  const perPage = Number(req.query.per_page) || 30;
  const safePerPage = Math.min(Math.max(perPage, 1), 100);

  try {
    const accessToken = await getStravaAccessToken();
    const activities = await getStravaActivities(accessToken, safePerPage);
    const runActivities = activities
      .filter((activity) => activity.type === "Run" || activity.sport_type === "Run")
      .filter((activity) => activity.distance > 0 && activity.moving_time > 0);
    // Observed max HR gives effort estimation a better baseline than each run's own max.
    const observedMaxHeartRate = getObservedMaxHeartRate(runActivities);
    const runs = runActivities.map((activity) =>
      mapStravaActivityToRun(activity, observedMaxHeartRate)
    );

    res.json({ runs });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Could not import Strava runs.",
      runs: [],
    });
  }
});

app.post("/api/ai-summary", async (req, res) => {
  const validationErrors = validateAiSummaryRequest(req.body);

  if (validationErrors.length > 0) {
    sendFallbackSummary(res, 400, {
      summary: validationErrors.join(" "),
    });
    return;
  }

  if (!openai) {
    sendFallbackSummary(res, 503, {
      summary: "The backend is missing an OpenAI API key.",
    });
    return;
  }

  const {
    totalMiles,
    longestRun,
    numberOfRuns,
    fitnessScore,
    trainingLoad,
    trendWindowDays,
    trendTotalMiles,
    trendLongestRun,
    trendNumberOfRuns,
    trendAverageWeeklyMiles,
    goalRace,
    selectedGoalTime,
    pastRaceDistance,
    pastRaceTime,
    pastRaceDate,
    raceDataSource,
    currentDate,
    daysSincePastRace,
    weeksSincePastRace,
    goalRaceDate,
    weeksUntilGoalRace,
  } = req.body;

  const runnerData = {
    totalMiles,
    longestRun,
    numberOfRuns,
    fitnessScore,
    trainingLoad,
    trendWindowDays,
    trendTotalMiles,
    trendLongestRun,
    trendNumberOfRuns,
    trendAverageWeeklyMiles,
    goalRace,
    selectedGoalTime,
    pastRaceDistance,
    pastRaceTime,
    pastRaceDate,
    raceDataSource,
    currentDate,
    daysSincePastRace,
    weeksSincePastRace,
    goalRaceDate,
    weeksUntilGoalRace,
  };

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,
      input: `
You are a running coach.

Analyze this runner's current fitness using the data below.

Data:
${JSON.stringify(runnerData, null, 2)}

Important date facts:
- Today's date is ${currentDate}.
- The past race was ${daysSincePastRace} days ago, which is about ${weeksSincePastRace} weeks ago.
- The goal race is ${weeksUntilGoalRace} weeks away.

Use these supplied date facts exactly. Do not recalculate or reinterpret the date gaps.

Prediction rules:
- The formula estimate is anchored to the race-tagged result and should be treated as the baseline.
- Use the ${trendWindowDays}-day trend data to judge confidence and realism.
- Do not judge race readiness from only the most recent 7 days.
- If the race tag is recent, the goal race is many weeks away, and the ${trendWindowDays}-day average weekly mileage is solid, do not make the adjusted goal time much slower than the formula estimate.
- If you do slow the goal time, explain the specific trend reason.

Use the formula estimate as the starting point, but adjust the goal time if the training data or race date makes it too aggressive or too conservative.

If the goal race is soon and the long run or mileage is low, make the adjusted goal time slower.

If the goal race is far away and the runner has a good base, the adjusted time can be close to the formula estimate.

Do not invent huge improvements.
Be realistic.
Do not include medical advice.
Do not overpromise race results.
      `,
      text: {
        format: {
          type: "json_schema",
          name: "race_readiness_ai_summary",
          schema: aiSummarySchema,
          strict: true,
        },
      },
    });

    const parsed = JSON.parse(response.output_text);

    if (!validateAiSummary(parsed)) {
      throw new Error("AI response did not match the expected summary shape.");
    }

    const constrainedSummary = constrainAdjustedGoalTime(parsed, runnerData);

    res.json({
      ...constrainedSummary,
      dateAssessment: `The ${raceDataSource.toLowerCase()} race was about ${weeksSincePastRace} weeks ago, and the goal race is ${weeksUntilGoalRace} weeks away.`,
    });
  } catch (error) {
    console.error(error);
    sendFallbackSummary(res, 500);
  }
});

app.post("/api/training-plan", async (req, res) => {
  const validationErrors = validateTrainingPlanRequest(req.body);

  if (validationErrors.length > 0) {
    sendFallbackTrainingPlan(res, 400, {
      overview: validationErrors.join(" "),
    });
    return;
  }

  if (!openai) {
    sendFallbackTrainingPlan(res, 503, {
      overview: "The backend is missing an OpenAI API key.",
    });
    return;
  }

  const {
    goalRace,
    goalRaceDate,
    currentDate,
    weeksUntilGoalRace,
    trendAverageWeeklyMiles,
    trendLongestRun,
    trendNumberOfRuns,
    selectedGoalTime,
    raceDataSource,
    mostRecentRace,
    observedMaxHeartRate,
    planPreferences,
    lockedWeeks,
    trendRuns,
  } = req.body;
  const planWeeks = Math.min(Math.max(weeksUntilGoalRace, 1), 24);
  // Keep only the data the model needs; this avoids sending unnecessary Strava fields.
  const runnerData = {
    goalRace,
    goalRaceDate,
    currentDate,
    weeksUntilGoalRace,
    planWeeks,
    trendAverageWeeklyMiles,
    trendLongestRun,
    trendNumberOfRuns,
    selectedGoalTime,
    raceDataSource,
    mostRecentRace,
    observedMaxHeartRate,
    planPreferences,
    lockedWeeks: Array.isArray(lockedWeeks) ? lockedWeeks : [],
    trendRuns: trendRuns.map((run) => ({
      date: run.date,
      type: run.type,
      distanceMiles: run.distanceMiles,
      pace: run.pace,
      effort: run.effort,
      elapsedTimeSeconds: run.elapsedTimeSeconds,
      movingTimeSeconds: run.movingTimeSeconds,
      averageHeartRate: run.averageHeartRate,
      maxHeartRate: run.maxHeartRate,
      elevationGainFeet: run.elevationGainFeet,
      averageCadence: run.averageCadence,
      isRace: run.isRace,
      raceDistance: run.raceDistance,
    })),
  };

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,
      input: `
You are a running coach creating a basic race training plan.

Generate a simple week-by-week plan using the runner data below.

Data:
${JSON.stringify(runnerData, null, 2)}

Rules:
- Return exactly ${planWeeks} weeks.
- Use the 90-day non-race training run list, average weekly mileage, longest non-race run, run frequency, recent race tag, and observed heart-rate data.
- Use planPreferences to shape the plan around the runner's goal, available days per week, long-run day, rest day, style preference, injury status, and notes.
- Treat Strava history as the baseline. Do not create a plan that ignores the runner's recent mileage and frequency.
- Return whyThisPlan as 3-5 short reasons explaining which Strava trends and setup answers shaped the plan.
- If lockedWeeks are supplied, preserve their intent and avoid contradicting them.
- The supplied mostRecentRace is a fitness anchor, not a normal long-run training baseline.
- Heart-rate data is mostly run-level average/max data, not full time-in-zone data. Do not pretend you know exact miles in each zone.
- Use heart rate as guidance: easy runs should usually stay conversational and mostly Z1/Z2; workouts may touch Z3/Z4/Z5 depending on the race.
- Keep the plan basic, realistic, and safe: one long run, mostly easy running, at most two quality sessions per week.
- The weekly structure should respect daysPerWeek when possible. If the runner asks for fewer days, reduce frequency before increasing workout intensity.
- Mention the requested longRunDay and restDay in notes when useful.
- Build gradually from the current 90-day mileage. Avoid huge jumps from the runner's current baseline.
- Include cutback/recovery weeks when useful.
- Taper before race day.
- Long-run caps: 5K about 6 miles, 10K about 8 miles, Half Marathon about 14 miles, Marathon about 20 miles.
- For this ${goalRace}, do not recommend a long run above ${getTrainingPlanLongRunCap(goalRace)} miles.
- If the goal race is soon or the data is thin, reduce confidence and make the plan conservative.
- Do not include medical advice. Do not overpromise results.
      `,
      text: {
        format: {
          type: "json_schema",
          name: "race_readiness_training_plan",
          schema: trainingPlanSchema,
          strict: true,
        },
      },
    });

    const parsed = JSON.parse(response.output_text);

    if (!validateTrainingPlan(parsed, weeksUntilGoalRace)) {
      throw new Error("AI response did not match the expected training plan shape.");
    }

    res.json(normalizeTrainingPlan(parsed, goalRace, trendAverageWeeklyMiles));
  } catch (error) {
    console.error(error);
    sendFallbackTrainingPlan(res, 500);
  }
});

app.post("/api/coach-check-in", async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    sendFallbackCoachInsight(res, 400, {
      whatChanged: "The request body was not valid.",
    });
    return;
  }

  if (!openai) {
    sendFallbackCoachInsight(res, 503, {
      whatChanged: "The backend is missing an OpenAI API key.",
    });
    return;
  }

  // The coach endpoint gets a compact snapshot, not the entire app state.
  const coachData = {
    currentDate: req.body.currentDate,
    goalRace: req.body.goalRace,
    goalRaceDate: req.body.goalRaceDate,
    weeksUntilGoalRace: req.body.weeksUntilGoalRace,
    selectedGoalTime: req.body.selectedGoalTime,
    trainingLoadMetrics: req.body.trainingLoadMetrics,
    trendAverageWeeklyMiles: req.body.trendAverageWeeklyMiles,
    trendLongestRun: req.body.trendLongestRun,
    trendNumberOfRuns: req.body.trendNumberOfRuns,
    recentRuns: Array.isArray(req.body.recentRuns)
      ? req.body.recentRuns.slice(0, 12)
      : [],
    fitnessTimeline: Array.isArray(req.body.fitnessTimeline)
      ? req.body.fitnessTimeline.slice(-8)
      : [],
    heartRateZones: req.body.heartRateZones,
    paceZones: req.body.paceZones,
  };

  try {
    const response = await openai.responses.create({
      model: AI_MODEL,
      input: `
You are a concise running coach.

Create a weekly check-in for this runner using the data below.

Data:
${JSON.stringify(coachData, null, 2)}

Rules:
- Explain what changed this week using the load trend and recent runs.
- Give one clear next move for the next 7 days.
- Point out one thing to watch.
- Use plain English.
- Do not include medical advice.
- Do not overpromise race results.
- Keep each field short: 1-2 sentences.
      `,
      text: {
        format: {
          type: "json_schema",
          name: "race_readiness_coach_check_in",
          schema: coachInsightSchema,
          strict: true,
        },
      },
    });

    const parsed = JSON.parse(response.output_text);

    if (!validateCoachInsight(parsed)) {
      throw new Error("AI response did not match the expected coach check-in shape.");
    }

    res.json(parsed);
  } catch (error) {
    console.error(error);
    sendFallbackCoachInsight(res, 500);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  sendFallbackSummary(res, 400, {
    summary: "The request could not be processed.",
  });
});

app.listen(PORT, () => {
  console.log(`AI backend running at http://localhost:${PORT}`);
});
