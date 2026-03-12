import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import { env } from "./env";

export async function createGmailTransport(
  refreshToken: string,
  userEmail: string
): Promise<nodemailer.Transporter | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2Client.getAccessToken();
  if (!token) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: userEmail,
      clientId,
      clientSecret,
      refreshToken,
      accessToken: token,
    },
  });
}
