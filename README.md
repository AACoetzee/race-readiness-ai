# Race Readiness AI

Race Readiness AI is a full-stack running dashboard that estimates a runner’s current fitness and race potential.

The app uses sample running data, race prediction formulas, and an AI-generated coaching summary to help explain a runner’s strengths, risks, and possible race outcomes.

## What It Does

- Displays a running fitness dashboard
- Calculates weekly mileage, longest run, number of runs, and training load
- Estimates race potential for:
  - 5K
  - 10K
  - Half Marathon
  - Marathon
- Lets the user enter a past race distance and time
- Uses a race prediction formula to estimate future race times
- Lets the user select a goal race and goal race date
- Uses AI to generate a coaching-style summary
- Highlights strengths, risks, and suggestions

## Tech Stack

- React
- TypeScript
- Vite
- CSS
- Node.js
- Express
- OpenAI API

## Why I Built This

I built this project to practice building a full-stack application with a real use case.

The goal was to combine:

- frontend UI design
- backend API logic
- running data analysis
- race prediction calculations
- AI-generated insights

This project is also a foundation for a future Strava-connected app.

## Current Features

### Fitness Dashboard

The dashboard shows:

- Weekly mileage
- Longest run
- Runs this week
- Training load
- Fitness score

### Race Prediction

The app allows the user to enter a past race result.

Example:

```text
Past race: 5K
Past time: 22:30
Goal race: Half Marathon

The app then estimates race potential using a race prediction formula and training adjustments.

AI Summary

The AI summary uses the runner’s current data to generate:

* A headline
* A short fitness summary
* An AI-adjusted goal time
* A confidence level
* Strengths
* Risks
* Suggestions

Project Structure
race-readiness-ai/
  public/
  src/
    components/
      RacePrediction.tsx
      RunCard.tsx
      StatCard.tsx
    data/
      sampleRuns.ts
    utils/
      aiCoachSummary.ts
      fitnessCalculations.ts
    App.tsx
    index.css
    main.tsx
  server.js
  package.json
  README.md

  How to Run Locally

1. Clone the repository
git clone https://github.com/AACoetzee/race-readiness-ai.git

2. Go into the project folder
cd race-readiness-ai

3. Install dependencies
npm install

4. Create an environment file

Create a file called .env in the main project folder.

Add your OpenAI API key:
OPENAI_API_KEY=your_api_key_here

Do not commit this file to GitHub.

5. Start the backend server
npm run server

The backend runs at:
http://localhost:3001

6. Start the React app

Open a second terminal and run:
npm run dev

The frontend runs at:
http://localhost:5173

Available Scripts
npm run dev

Starts the React frontend.
npm run server

Starts the Express backend.
npm run build

Builds the app for production.
npm run preview

Previews the production build.

Environment Variables

This project uses the OpenAI API.

Create a .env file:
OPENAI_API_KEY=your_api_key_here

Important:

* Never commit .env
* Never put API keys directly in frontend code
* Keep secrets on the backend only

Current Limitations

This is an early version.

The app currently uses sample running data instead of live Strava data.

The race predictions are estimates and should not be treated as guaranteed race outcomes.

The AI summary is meant to explain the data and provide general training insight. It is not medical advice.

Future Improvements

Planned improvements:

* Connect to the Strava API
* Pull real running activity data
* Add weekly mileage trends
* Add pace trend charts
* Add heart rate and elevation analysis
* Improve race prediction logic
* Add user authentication
* Save athlete profiles
* Add deployment

Notes

This project uses a science-based race prediction formula as a starting point, then uses AI to provide context around the estimate.

The formula gives a baseline estimate.

The AI helps explain whether that estimate seems realistic based on training load, long run distance, consistency, and goal race timing.

Then save:

```text
Command + S