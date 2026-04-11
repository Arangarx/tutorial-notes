"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { renameStudent, deleteStudent } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function StudentActions({
  studentId,
  currentName,
}: {
  studentId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (confirmDelete) {
    return (
      <div className="row">
        <span className="muted" style={{ fontSize: 14 }}>Delete &ldquo;{currentName}&rdquo;? This is permanent.</span>
        <form
          action={async () => {
            await deleteStudent(studentId);
            router.push("/admin/students");
          }}
        >
          <button className="btn" type="submit" style={{ color: "#ffb4b4" }}>Delete</button>
        </form>
        <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>
          Cancel
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <form
        action={async (fd: FormData) => {
          await renameStudent(studentId, fd);
          setEditing(false);
        }}
      >
        <div className="row">
          <input name="name" defaultValue={currentName} required style={{ maxWidth: 280 }} />
          <SubmitButton label="Save" pendingLabel="Saving…" />
          <button className="btn" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="row">
      <button className="btn" type="button" onClick={() => setEditing(true)}>
        Rename
      </button>
      <button className="btn" type="button" onClick={() => setConfirmDelete(true)}
        style={{ color: "#ffb4b4" }}>
        Delete student
      </button>
    </div>
  );
}
