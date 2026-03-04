import { useMemo, useState } from "react";
import { dump, load } from "js-yaml";
import type { PlannerPayload } from "../services/plannerApi";
import { putConfigYaml } from "../services/plannerApi";

type Props = {
  planner: PlannerPayload;
  onSaved: () => void;
};

type ConfigKey =
  | "season"
  | "practices"
  | "teams"
  | "colors"
  | "members"
  | "tasks";

type ConfigDoc = {
  key: ConfigKey;
  title: string;
};

const CONFIG_DOCS: ConfigDoc[] = [
  { key: "season", title: "Season" },
  { key: "practices", title: "Practices" },
  { key: "teams", title: "Teams" },
  { key: "colors", title: "Color Palettes" },
  { key: "members", title: "Members" },
  { key: "tasks", title: "Tasks" },
];

function toYamlText(payload: unknown): string {
  return dump(payload, { sortKeys: false, lineWidth: 120 });
}

function buildInitialDocs(planner: PlannerPayload): Record<ConfigKey, string> {
  return {
    season: toYamlText({ season: planner.season, events: planner.events, breaks: planner.breaks }),
    practices: toYamlText(planner.practices),
    teams: toYamlText({ teams: planner.teams }),
    colors: toYamlText({ colors: planner.colors }),
    members: toYamlText({ members: planner.members }),
    tasks: toYamlText({ tasks: planner.tasks }),
  };
}

function syntaxCheck(name: ConfigKey, text: string): void {
  try {
    load(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid YAML syntax";
    throw new Error(`${name}.yaml syntax error: ${message}`);
  }
}

export function ConfigPage({ planner, onSaved }: Props) {
  const [documents, setDocuments] = useState(() => buildInitialDocs(planner));
  const [originals, setOriginals] = useState(() => buildInitialDocs(planner));
  const [fileWarnings, setFileWarnings] = useState<Partial<Record<ConfigKey, string>>>({});
  const [status, setStatus] = useState("");

  const rows = useMemo(() => 12, []);

  const updateOne = async (key: ConfigKey): Promise<boolean> => {
    const yamlText = documents[key] ?? "";
    try {
      syntaxCheck(key, yamlText);
      await putConfigYaml(key, yamlText);
      setFileWarnings((current) => ({ ...current, [key]: "" }));
      setOriginals((current) => ({ ...current, [key]: yamlText }));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      setFileWarnings((current) => ({ ...current, [key]: message }));
      return false;
    }
  };

  const updateAll = async () => {
    setStatus("Updating...");
    const failures: string[] = [];
    let updated = 0;

    for (const doc of CONFIG_DOCS) {
      const ok = await updateOne(doc.key);
      if (ok) {
        updated += 1;
      } else {
        failures.push(doc.key);
      }
    }

    if (failures.length > 0) {
      setStatus(`Updated ${updated}/${CONFIG_DOCS.length}; failed: ${failures.join(", ")}`);
    } else {
      setStatus(`Updated ${updated}/${CONFIG_DOCS.length}`);
    }
    onSaved();
  };

  return (
    <div className="config-page">
      <p className="muted">
        This page writes updates to YAML-backed API resources. Manual edits in YAML files trigger live
        updates as well.
      </p>
      <div className="editor-grid">
        {CONFIG_DOCS.map((doc) => (
          <section key={doc.key} className="config-section">
            <h3 className="config-section-head">
              {doc.title}
              <button
                disabled={documents[doc.key] === originals[doc.key]}
                onClick={async () => {
                  setStatus(`Saving ${doc.key}.yaml...`);
                  const ok = await updateOne(doc.key);
                  if (ok) {
                    setStatus(`Saved ${doc.key}.yaml`);
                    onSaved();
                  } else {
                    setStatus(`Failed to save ${doc.key}.yaml`);
                  }
                }}
              >
                Save Changes
              </button>
            </h3>
            <textarea
              value={documents[doc.key]}
              onChange={(event) =>
                setDocuments((current) => ({ ...current, [doc.key]: event.target.value }))
              }
              rows={rows}
            />
            {fileWarnings[doc.key] && <div className="warning-item">{fileWarnings[doc.key]}</div>}
          </section>
        ))}
      </div>

      <div className="config-actions">
        <button onClick={updateAll}>Update All</button>
        <span className="muted">{status}</span>
      </div>
    </div>
  );
}
