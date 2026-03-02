import { useMemo, useState } from "react";
import type { PlannerPayload } from "../services/plannerApi";
import { putConfig, putTasks } from "../services/plannerApi";

type Props = {
  planner: PlannerPayload;
  onSaved: () => void;
};

export function ConfigPage({ planner, onSaved }: Props) {
  const [seasonText, setSeasonText] = useState(
    JSON.stringify({ season: planner.season }, null, 2)
  );
  const [practiceText, setPracticeText] = useState(JSON.stringify(planner.practices, null, 2));
  const [tournamentText, setTournamentText] = useState(
    JSON.stringify({ events: planner.events }, null, 2)
  );
  const [breaksText, setBreaksText] = useState(JSON.stringify({ breaks: planner.breaks }, null, 2));
  const [teamsText, setTeamsText] = useState(JSON.stringify({ teams: planner.teams }, null, 2));
  const [membersText, setMembersText] = useState(
    JSON.stringify({ members: planner.members }, null, 2)
  );
  const [tasksText, setTasksText] = useState(JSON.stringify({ tasks: planner.tasks }, null, 2));
  const [status, setStatus] = useState("");

  const rows = useMemo(() => 12, []);

  const saveAll = async () => {
    setStatus("Saving...");
    try {
      await putConfig("season", JSON.parse(seasonText));
      await putConfig("practices", JSON.parse(practiceText));
      await putConfig("events", JSON.parse(tournamentText));
      await putConfig("breaks", JSON.parse(breaksText));
      await putConfig("teams", JSON.parse(teamsText));
      await putConfig("members", JSON.parse(membersText));
      await putTasks(JSON.parse(tasksText));
      setStatus("Saved");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  return (
    <div className="config-page">
      <p className="muted">
        This page writes updates to YAML-backed API resources. Manual edits in YAML files trigger live
        updates as well.
      </p>
      <div className="editor-grid">
        <section>
          <h3>Season</h3>
          <textarea value={seasonText} onChange={(e) => setSeasonText(e.target.value)} rows={rows} />
        </section>
        <section>
          <h3>Practices + Overrides</h3>
          <textarea
            value={practiceText}
            onChange={(e) => setPracticeText(e.target.value)}
            rows={rows}
          />
        </section>
        <section>
          <h3>Events + Travel</h3>
          <textarea
            value={tournamentText}
            onChange={(e) => setTournamentText(e.target.value)}
            rows={rows}
          />
        </section>
        <section>
          <h3>Breaks</h3>
          <textarea value={breaksText} onChange={(e) => setBreaksText(e.target.value)} rows={rows} />
        </section>
        <section>
          <h3>Teams + Colors</h3>
          <textarea value={teamsText} onChange={(e) => setTeamsText(e.target.value)} rows={rows} />
        </section>
        <section>
          <h3>Members + Team Membership</h3>
          <textarea
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
            rows={rows}
          />
        </section>
        <section>
          <h3>Tasks</h3>
          <textarea value={tasksText} onChange={(e) => setTasksText(e.target.value)} rows={rows} />
        </section>
      </div>

      <div className="config-actions">
        <button onClick={saveAll}>Save All</button>
        <span className="muted">{status}</span>
      </div>
    </div>
  );
}
