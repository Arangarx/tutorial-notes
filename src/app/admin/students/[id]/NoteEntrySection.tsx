"use client";

import { useRef, useState } from "react";
import AiAssistPanel from "./AiAssistPanel";
import NewNoteForm from "./NewNoteForm";
import type { NewNoteFormHandle } from "./NewNoteForm";

type Props = {
  studentId: string;
  aiEnabled: boolean;
  blobEnabled: boolean;
};

export default function NoteEntrySection({ studentId, aiEnabled, blobEnabled }: Props) {
  const formRef = useRef<NewNoteFormHandle>(null);
  const [panelKey, setPanelKey] = useState(0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 12,
        alignItems: "start",
      }}
    >
      <AiAssistPanel
        key={panelKey}
        studentId={studentId}
        formRef={formRef}
        enabled={aiEnabled}
        blobEnabled={blobEnabled}
      />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>New session note</h3>
        <NewNoteForm ref={formRef} studentId={studentId} onSaved={() => setPanelKey((k) => k + 1)} />
      </div>
    </div>
  );
}
