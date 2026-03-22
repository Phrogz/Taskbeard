import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { load, YAMLException } from "js-yaml";
import type { PlannerPayload } from "../services/plannerApi";
import { getConfigYaml, putConfigYaml } from "../services/plannerApi";
import { Toast, type ToastItem } from "../components/Toast";

type Props = {
  planner: PlannerPayload;
  onSaved: () => void;
  readOnly?: boolean;
};

type ConfigKey =
  | "season"
  | "practices"
  | "teams"
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
  { key: "members", title: "Members" },
  { key: "tasks", title: "Tasks" },
];

function formatYamlError(name: ConfigKey, error: unknown): string {
  if (error instanceof YAMLException) {
    const line = error.mark ? error.mark.line + 1 : "?";
    const col = error.mark ? error.mark.column + 1 : "?";
    return `${name}.yaml (line ${line}, col ${col})\n${error.reason}`;
  }
  if (error instanceof Error) return `${name}.yaml: ${error.message}`;
  return `${name}.yaml: unknown error`;
}

const EMPTY_DOCS: Record<ConfigKey, string> = {
  season: "", practices: "", teams: "", members: "", tasks: "",
};

export function ConfigPage({ planner, onSaved, readOnly }: Props) {
  const [documents, setDocuments] = useState<Record<ConfigKey, string>>(EMPTY_DOCS);
  const [originals, setOriginals] = useState<Record<ConfigKey, string>>(EMPTY_DOCS);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const toastId = useRef(0);

  const addToast = useCallback((message: string, variant: ToastItem["variant"]) => {
    const id = String(++toastId.current);
    const autoCloseMs = variant === "error" ? 12000 : undefined;
    setToasts((current) => [...current, { id, message, variant, autoCloseMs }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const rows = useMemo(() => 24, []);

  const anyDirty = useMemo(
    () => CONFIG_DOCS.some((doc) => documents[doc.key] !== originals[doc.key]),
    [documents, originals],
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
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
      } catch (error) {
        if (cancelled) return;
        addToast(error instanceof Error ? error.message : "Failed to load config", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [planner]);

  const updateOne = async (key: ConfigKey): Promise<boolean> => {
    const yamlText = documents[key] ?? "";
    try {
      load(yamlText);
    } catch (error) {
      addToast(formatYamlError(key, error), "error");
      return false;
    }
    try {
      await putConfigYaml(key, yamlText);
      setOriginals((current) => ({ ...current, [key]: yamlText }));
      return true;
    } catch (error) {
      addToast(formatYamlError(key, error), "error");
      return false;
    }
  };

  const updateAll = async () => {
    let anyFailed = false;

    for (const doc of CONFIG_DOCS) {
      if (documents[doc.key] === originals[doc.key]) continue;
      const ok = await updateOne(doc.key);
      if (ok) {
        addToast(`Saved ${doc.key}.yaml`, "success");
      } else {
        anyFailed = true;
      }
    }

    if (!anyFailed) onSaved();
  };

  if (loading) return <div className="config-page"><p className="muted">Loading config files...</p></div>;

  return (
    <div className="config-page">
      <div className="editor-grid">
        {CONFIG_DOCS.map((doc) => (
          <section key={doc.key} className="config-section">
            <h3 className="config-section-head">
              {doc.title}
              {!readOnly && (
                <button
                  className="config-save-button"
                  disabled={documents[doc.key] === originals[doc.key]}
                  onClick={async () => {
                    const ok = await updateOne(doc.key);
                    if (ok) {
                      addToast(`Saved ${doc.key}.yaml`, "success");
                      onSaved();
                    }
                  }}
                >
                  Save Changes
                </button>
              )}
            </h3>
            <textarea
              value={documents[doc.key]}
              readOnly={readOnly}
              onChange={(event) =>
                setDocuments((current) => ({ ...current, [doc.key]: event.target.value }))
              }
              rows={rows}
            />
          </section>
        ))}
      </div>

      {!readOnly && (
        <div className="config-actions">
          <button onClick={updateAll} disabled={!anyDirty}>Save All</button>
        </div>
      )}

      <Toast items={toasts} onDismiss={dismissToast} autoCloseMs={3000} />
    </div>
  );
}
