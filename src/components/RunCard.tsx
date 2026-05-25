import type { Run } from "../data/sampleRuns";

type RunCardProps = {
  run: Run;
};

function RunCard({ run }: RunCardProps) {
  return (
    <div className="runBox">
      <div>
        <h3>{run.type}</h3>
        <p>{run.date}</p>
      </div>

      <div className="runDetails">
        <div>
          <strong>{run.distanceMiles} mi</strong>
          <p>{run.pace}</p>
        </div>

        <span className="pill">{run.effort}</span>
      </div>
    </div>
  );
}

export default RunCard;