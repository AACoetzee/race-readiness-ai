type RacePredictionProps = {
  race: string;
  time: string;
};

function RacePrediction({ race, time }: RacePredictionProps) {
  return (
    <div className="predictionBox">
      <span>{race}</span>
      <strong>{time}</strong>
    </div>
  );
}

export default RacePrediction;