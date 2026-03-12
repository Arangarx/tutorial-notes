/**
 * Email module: when SMTP is not configured, sendMail returns { sent: false }.
 * When configured, integration would require a real or mock transport (tested via e2e or manual).
 */
import { sendMail } from "@/lib/email";

test("sendMail when SMTP not configured returns sent: false", async () => {
  const result = await sendMail({
    to: "test@example.com",
    subject: "Test",
    text: "Body",
  });
  expect(result.sent).toBe(false);
});
