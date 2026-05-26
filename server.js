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
app.use(express.json({ limit: "20kb" }));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

function metersToMiles(meters) {
  return meters / 1609.344;
}

function formatPace(minutesPerMile) {
  const totalSeconds = Math.round(minutesPerMile * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /mi`;
}

function estimateEffort(activity) {
  if (activity.average_heartrate && activity.max_heartrate) {
    const heartRateRatio = activity.average_heartrate / activity.max_heartrate;

    if (heartRateRatio >= 0.85) {
      return "Hard";
    }

    if (heartRateRatio >= 0.75) {
      return "Moderate";
    }
  }

  if (activity.workout_type === 1 || activity.workout_type === 3) {
    return "Hard";
  }

  return "Easy";
}

function getRaceDistance(distanceMiles) {
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

function mapStravaActivityToRun(activity) {
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
    effort: estimateEffort(activity),
    elapsedTimeSeconds: isRace ? activity.elapsed_time : activity.moving_time,
    isRace,
    raceDistance: isRace ? getRaceDistance(distanceMiles) : undefined,
    source: "Strava",
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

  if (!isValidDateString(body.pastRaceDate)) {
    errors.push("pastRaceDate must use YYYY-MM-DD format.");
  }

  if (!isValidDateString(body.goalRaceDate)) {
    errors.push("goalRaceDate must use YYYY-MM-DD format.");
  }

  if (!Number.isInteger(body.weeksUntilGoalRace) || body.weeksUntilGoalRace < 0) {
    errors.push("weeksUntilGoalRace must be a non-negative integer.");
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

function sendFallbackSummary(res, status, summary) {
  res.status(status).json({
    ...fallbackSummary,
    ...summary,
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
    const runs = activities
      .filter((activity) => activity.type === "Run" || activity.sport_type === "Run")
      .filter((activity) => activity.distance > 0 && activity.moving_time > 0)
      .map(mapStravaActivityToRun);

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
    goalRace,
    selectedGoalTime,
    pastRaceDistance,
    pastRaceTime,
    pastRaceDate,
    goalRaceDate,
    weeksUntilGoalRace,
  } = req.body;

  const runnerData = {
    totalMiles,
    longestRun,
    numberOfRuns,
    fitnessScore,
    trainingLoad,
    goalRace,
    selectedGoalTime,
    pastRaceDistance,
    pastRaceTime,
    pastRaceDate,
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

    res.json(parsed);
  } catch (error) {
    console.error(error);
    sendFallbackSummary(res, 500);
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
