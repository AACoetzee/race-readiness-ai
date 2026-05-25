import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/ai-summary", async (req, res) => {
  try {
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

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are a running coach.

Analyze this runner's current fitness using the data below.

Data:
- Total weekly miles: ${totalMiles}
- Longest run: ${longestRun}
- Number of runs this week: ${numberOfRuns}
- Fitness score: ${fitnessScore}/100
- Training load: ${trainingLoad}
- Goal race: ${goalRace}
- Estimated goal time: ${selectedGoalTime}
- Past race date: ${pastRaceDate}
- Goal race date: ${goalRaceDate}
- Weeks until goal race: ${weeksUntilGoalRace}

Use the formula estimate as the starting point, but adjust the goal time if the training data or race date makes it too aggressive or too conservative.

If the goal race is soon and the long run or mileage is low, make the adjusted goal time slower.

If the goal race is far away and the runner has a good base, the adjusted time can be close to the formula estimate.

Do not invent huge improvements.
Be realistic.

Return a short JSON object with this exact shape:
{
  "headline": "one short sentence",
  "summary": "2 short sentences",
  "aiAdjustedGoalTime": "realistic adjusted goal time",
  "confidence": "Low, Medium, or High",
  "dateAssessment": "one sentence about the time between now and the goal race",
  "strengths": ["short item", "short item"],
  "risks": ["short item", "short item"],
  "suggestions": ["short item", "short item"]
}

Do not include markdown.
Do not include medical advice.
Do not overpromise race results.
      `,
    });

    const text = response.output_text;
    const parsed = JSON.parse(text);

    res.json(parsed);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      headline: "AI summary is unavailable right now.",
      summary: "The app could not generate an AI summary. Try again later.",
      strengths: [],
      risks: [],
      suggestions: [],
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI backend running at http://localhost:${PORT}`);
});