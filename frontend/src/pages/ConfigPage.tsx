import { useEffect, useMemo, useState } from "react";
import { load } from "js-yaml";
import type { PlannerPayload } from "../services/plannerApi";
import { getConfigYaml, putConfigYaml } from "../services/plannerApi";

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

function syntaxCheck(name: ConfigKey, text: string): void {
  try {
    load(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid YAML syntax";
    throw new Error(`${name}.yaml syntax error: ${message}`);
  }
}

const EMPTY_DOCS: Record<ConfigKey, string> = {
  season: "", practices: "", teams: "", colors: "", members: "", tasks: "",
};

export function ConfigPage({ planner, onSaved }: Props) {
  const [documents, setDocuments] = useState<Record<ConfigKey, string>>(EMPTY_DOCS);
  const [originals, setOriginals] = useState<Record<ConfigKey, string>>(EMPTY_DOCS);
  const [fileWarnings, setFileWarnings] = useState<Partial<Record<ConfigKey, string>>>({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const rows = useMemo(() => 24, []);

  const anyDirty = useMemo(
    () => CONFIG_DOCS.some((doc) => documents[doc.key] !== originals[doc.key]),
    [documents, originals],
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const entries = await Promise.all(
        CONFIG_DOCS.map(async (doc) => {
          const text = await getConfigYaml(doc.key);
          return [doc.key, text] as const;
        })
      );
      if (cancelled) return;
      const docs = { ...EMPTY_DOCS };
      for (const [key, text] of entries) docs[key] = text;
      setDocuments(docs);
      setOriginals(docs);
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [planner]);

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
    setStatus("Saving...");
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

  if (loading) return <div className="config-page"><p className="muted">Loading config files...</p></div>;

  return (
    <div className="config-page">
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
        <button onClick={updateAll} disabled={!anyDirty}>Save All</button>
        <span className="muted">{status}</span>
      </div>
    </div>
  );
}
