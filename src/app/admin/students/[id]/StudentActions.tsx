"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { renameStudent, deleteStudent } from "./actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
        <span className="text-sm text-muted-foreground">
          Delete &ldquo;{currentName}&rdquo;? This is permanent.
        </span>
        <form
          action={async () => {
            await deleteStudent(studentId);
            router.push("/admin/students");
          }}
          className="flex flex-wrap gap-2"
        >
          <Button type="submit" variant="destructive" className="min-h-11">
            Delete
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </form>
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
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="rename-student">Name</Label>
          <Input
            id="rename-student"
            name="name"
            defaultValue={currentName}
            required
            className="min-h-11 max-w-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FormSubmitButton label="Save" pendingLabel="Saving…" />
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(true)}>
        Rename
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive/60"
        onClick={() => setConfirmDelete(true)}
      >
        Delete student
      </Button>
    </div>
  );
}
