import { useState } from "react";
import "./index.css";
import { sampleRuns } from "./data/sampleRuns";
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
import RacePrediction from "./components/RacePrediction";
import RunCard from "./components/RunCard";

function App() {
const [goalRace, setGoalRace] = useState("Half Marathon");
const [pastRaceDistance, setPastRaceDistance] = useState("5K");
const [pastRaceTime, setPastRaceTime] = useState("00:00"); 

const [pastRaceDate, setPastRaceDate] = useState("2026-05-01");
const [goalRaceDate, setGoalRaceDate] = useState("2026-10-12");

const today = new Date();

const goalDate = new Date(goalRaceDate);

const weeksUntilGoalRace = Math.max(
  0,
  Math.ceil(
    (goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)
  )
);

function clearAiSummary() {
  setAiSummary(null);
}

const isPastRaceTimeValid = convertRaceTimeToMinutes(pastRaceTime) > 0;


const totalMiles = calculateTotalMiles(sampleRuns);
const longestRun = calculateLongestRun(sampleRuns);
const numberOfRuns = calculateNumberOfRuns(sampleRuns);
const fitnessScore = calculateFitnessScore(sampleRuns);

const racePredictions = isPastRaceTimeValid
  ? calculateRacePredictions(sampleRuns, pastRaceDistance, pastRaceTime)
  : null;

const fitnessBreakdown = calculateFitnessBreakdown(sampleRuns);
const trainingLoad = calculateTrainingLoad(sampleRuns);

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

async function handleGenerateAISummary() {
  setIsLoadingAI(true);

  try {
    const response = await fetch("http://localhost:3001/api/ai-summary", {
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
        goalRace,
        selectedGoalTime,
        pastRaceDistance,
        pastRaceTime,
        pastRaceDate,
        goalRaceDate,
        weeksUntilGoalRace,
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

  return (



    <main className="app">
      <header className="topBar">
        <div>
          <p className="eyebrow">Race Readiness AI</p>
          <h1>Running Fitness Dashboard</h1>
        </div>

        <div className="buttonRow">
          <button className="secondaryButton">Import Data</button>
          <button className="primaryButton">Analyze Fitness</button>
        </div>
      </header>

   <div className="dashboardGrid">

  <section className="heroCard">
    <div>
      <p className="eyebrow">Current Status</p>
      <h2>You are building a strong base</h2>
      <p className="bodyText">
        This first version uses sample running data. Later, this will connect to
        Strava and use AI to explain fitness and race potential.
      </p>
    </div>

    <div className="scoreBox">
      <p>Fitness Score</p>
      <strong>{fitnessScore}</strong>
      <span>out of 100</span>
    </div>
  </section>

  <section className="statsGrid">
    <StatCard title="Weekly Mileage" value={`${totalMiles} mi`} />
    <StatCard title="Longest Run" value={`${longestRun} mi`} />
    <StatCard title="Runs This Week" value={`${numberOfRuns}`} />
    <StatCard title="Training Load" value={trainingLoad} />
  </section>
</div>

      <section className="contentGrid">


   <section className="card goalCard">
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

      <p className="goalFormulaText">
        {isPastRaceTimeValid ? (
          <>
            Based on your past {pastRaceDistance} time of{" "}
            <strong>{pastRaceTime}</strong>, your estimated {goalRace} time is:
          </>
        ) : (
          <>Enter a valid past race time to see your estimate.</>
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
      <p className="cardLabel">Past race details</p>

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
              <p>Sample activities for your first dashboard.</p>
            </div>

            <button className="smallButton">View All</button>
          </div>

<div className="runList">
  {sampleRuns.map((run) => (
    <RunCard key={run.date} run={run} />
  ))}
</div>

        </div>

        <div className="card">
          <h2>Race Potential</h2>
          <p className="mutedText">Early estimate based on sample data.</p>

          <div className="predictionList">
            {racePredictions ? (
  <>
    <RacePrediction race="5K" time={racePredictions.fiveK} />
    <RacePrediction race="10K" time={racePredictions.tenK} />
    <RacePrediction race="Half Marathon" time={racePredictions.halfMarathon} />
    <RacePrediction race="Marathon" time={racePredictions.marathon} />
  </>
) : (
  <div className="emptyStateBox">
    Enter a valid past race time to calculate race predictions.
  </div>
)}


          </div>

          

        </div>
      </section>

      <section className="card">
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
          <button className="secondaryButton">Edit Sample Data</button>
          <button className="secondaryButton">Add Goal Race</button>
          <button className="secondaryButton">Export Report</button>
        </div>
      </section>
    </main>
  );
}

export default App;