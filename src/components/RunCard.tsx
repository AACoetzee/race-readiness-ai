import type { Run } from "../data/sampleRuns";

type RunCardProps = {
  run: Run;
  onSelect: (run: Run) => void;
};

function RunCard({ run, onSelect }: RunCardProps) {
  return (
    <button className="runBox" type="button" onClick={() => onSelect(run)}>
      <div>
        <h3>{run.type}</h3>
        <p>{run.date}</p>
      </div>

      <div className="runDetails">
        <div>
          <strong>{run.distanceMiles} mi</strong>
          <p>{run.pace}</p>
        </div>

        <div className="runPills">
          {run.isRace && <span className="pill racePill">Race</span>}
          <span className="pill">{run.effort}</span>
        </div>
      </div>
    </button>
  );
}

export default RunCard;
