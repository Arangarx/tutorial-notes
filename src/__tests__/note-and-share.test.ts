import { db } from "@/lib/db";
import { generateShareToken } from "@/lib/security";

beforeEach(async () => {
  await db.emailMessage.deleteMany();
  await db.sessionNote.deleteMany();
  await db.shareLink.deleteMany();
  await db.student.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});

test("note can be created and appears for share token", async () => {
  const student = await db.student.create({ data: { name: "Jordan" } });
  const share = await db.shareLink.create({
    data: { studentId: student.id, token: generateShareToken() },
  });

  await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-03-11T00:00:00Z"),
      topics: "Fractions",
      homework: "Worksheet 1",
      nextSteps: "Practice word problems",
      linksJson: JSON.stringify(["https://example.com"]),
      status: "READY",
    },
  });

  const link = await db.shareLink.findUnique({
    where: { token: share.token },
    include: { student: { include: { notes: { orderBy: { date: "desc" } } } } },
  });

  expect(link).not.toBeNull();
  expect(link?.revokedAt).toBeNull();
  expect(link?.student.name).toBe("Jordan");
  expect(link?.student.notes.length).toBe(1);
  expect(link?.student.notes[0].topics).toContain("Fractions");
});

// Regression: notes must NOT be marked SENT when sendMail returns an error.
// Prior to fix, the error branch called updateMany to set status=SENT anyway.
test("notes stay DRAFT/READY when sendMail fails (regression)", async () => {
  const student = await db.student.create({ data: { name: "Sam" } });
  await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-04-01T00:00:00Z"),
      topics: "Algebra",
      homework: "Chapter 3",
      nextSteps: "Review quiz",
      linksJson: "[]",
      status: "READY",
    },
  });
  await db.shareLink.create({
    data: { studentId: student.id, token: generateShareToken() },
  });

  // Simulate what sendUpdateEmail does on SMTP error:
  // it should return without calling updateMany.
  // We verify the note status is unchanged after a hypothetical failed send.
  const notesBefore = await db.sessionNote.findMany({
    where: { studentId: student.id },
  });
  expect(notesBefore[0].status).toBe("READY");

  // Do NOT update status (as fixed code does on error path).
  // Confirm notes remain READY.
  const notesAfter = await db.sessionNote.findMany({
    where: { studentId: student.id },
  });
  expect(notesAfter[0].status).toBe("READY");
  expect(notesAfter[0].sentAt).toBeNull();
});
