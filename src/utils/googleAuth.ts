import { GoogleAuthProvider, signInWithPopup, User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

// Global in-memory cache for the Google OAuth access token
let cachedAccessToken: string | null = null;

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
  if (token) {
    console.log("[Google Auth Token Cached]: Active session token established.");
  } else {
    console.log("[Google Auth Token Cleared]: Active session token destroyed.");
  }
}

/**
 * Perform a fresh Google SignIn and request Gmail send and identity scopes.
 */
export async function requestGoogleAuthToken(): Promise<string | null> {
  try {
    // Crucial: Clear scopes and add Gmail send and profile/email scopes
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.send");
    provider.addScope("https://www.googleapis.com/auth/userinfo.email");
    provider.addScope("https://www.googleapis.com/auth/userinfo.profile");

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;
    
    setCachedAccessToken(token);
    return token;
  } catch (err) {
    console.error("[Google Auth Error]: Failed to authenticate or retrieve credentials.", err);
    throw err;
  }
}

/**
 * Send an email directly using the Gmail API (RFC 2822 MIME message compiled and base64url encoded).
 */
export async function sendGmail(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  try {
    if (!accessToken) {
      console.error("[Gmail API Error]: Access Token is missing.");
      return false;
    }

    const emailParts = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlBody
    ];
    const rawEmail = emailParts.join("\r\n");

    const base64urlMime = btoa(unescape(encodeURIComponent(rawEmail)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    console.log(`[Gmail API Send]: Sending message to ${to} via Google API...`);
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        raw: base64urlMime
      })
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      console.error("[Gmail API Send Failed]:", errorMsg);
      return false;
    }

    console.log("[Gmail API Send Succeeded]: Message sent successfully.");
    return true;
  } catch (error) {
    console.error("[Gmail API Exception]:", error);
    return false;
  }
}
