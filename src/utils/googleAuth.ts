import { GoogleAuthProvider, signInWithPopup, User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

// Global in-memory cache for the Google OAuth access token
let cachedAccessToken: string | null = null;

const STORAGE_KEY_TOKEN = "mindspace_google_access_token";
const STORAGE_KEY_TIME = "mindspace_google_token_timestamp";

export function getCachedAccessToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken;

  try {
    const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const savedTime = localStorage.getItem(STORAGE_KEY_TIME);
    if (savedToken && savedTime) {
      const elapsed = Date.now() - Number(savedTime);
      const isExpired = elapsed >= 55 * 60 * 1000; // 55 minutes expiration buffer (Google tokens expire in 60 mins)
      if (!isExpired) {
        cachedAccessToken = savedToken;
        console.log("[Google Auth] Restored active token from browser storage, valid for another", Math.round((55 * 60 * 1000 - elapsed) / 1000), "seconds.");
        return cachedAccessToken;
      } else {
        console.log("[Google Auth] Token in browser storage has expired, removing...");
        clearCachedAccessToken();
      }
    }
  } catch (err) {
    console.warn("[Google Auth] Could not access localStorage:", err);
  }

  return null;
}

export function clearCachedAccessToken(): void {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_TIME);
  } catch (err) {
    console.warn("[Google Auth] Could not remove localStorage tokens:", err);
  }
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      localStorage.setItem(STORAGE_KEY_TIME, String(Date.now()));
      console.log("[Google Auth Token Cached]: Session token saved to browser storage.");
    } else {
      clearCachedAccessToken();
      console.log("[Google Auth Token Cleared]: Session token cleared.");
    }
  } catch (err) {
    console.warn("[Google Auth] Could not write to localStorage:", err);
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
