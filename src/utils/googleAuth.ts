// En la etapa de recuperación, MindSpace no conserva tokens OAuth de Google
// ni envía correos con información de citas o pacientes desde el navegador.
const STORAGE_KEY_TOKEN = "mindspace_google_access_token";
const STORAGE_KEY_TIME = "mindspace_google_token_timestamp";

export function clearCachedAccessToken(): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      sessionStorage.removeItem(STORAGE_KEY_TIME);
    }
  } catch {
    // El almacenamiento puede no estar disponible en algunos navegadores.
  }
}

export function getCachedAccessToken(): null {
  clearCachedAccessToken();
  return null;
}

export function setCachedAccessToken(_token: string | null): void {
  clearCachedAccessToken();
}

export async function requestGoogleAuthToken(_promptInteraction = true): Promise<null> {
  clearCachedAccessToken();
  return null;
}

export async function refreshGoogleToken(): Promise<null> {
  clearCachedAccessToken();
  return null;
}

export async function sendGmail(
  _accessToken: string | null,
  _to: string,
  _subject: string,
  _htmlBody: string,
): Promise<boolean> {
  clearCachedAccessToken();
  return false;
}

// Elimina tokens previamente guardados por la versión anterior.
clearCachedAccessToken();
