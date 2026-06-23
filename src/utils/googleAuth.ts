import { GoogleAuthProvider, signInWithPopup, User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

// ============================================================
// 1. CONFIGURACIÓN DE ALMACENAMIENTO (sessionStorage en lugar de localStorage)
// ============================================================
const STORAGE_KEY_TOKEN = "mindspace_google_access_token";
const STORAGE_KEY_TIME = "mindspace_google_token_timestamp";
const TOKEN_EXPIRY_MS = 55 * 60 * 1000; // 55 minutos (margen de seguridad)

// Variables en memoria (más seguras que el almacenamiento persistente)
let cachedAccessToken: string | null = null;
let tokenExpiryTimer: number | null = null;

// ============================================================
// 2. FUNCIONES DE ALMACENAMIENTO (usando sessionStorage)
// ============================================================

function getStoredToken(): string | null {
  try {
    const token = sessionStorage.getItem(STORAGE_KEY_TOKEN);
    const timestamp = sessionStorage.getItem(STORAGE_KEY_TIME);
    if (token && timestamp) {
      const elapsed = Date.now() - Number(timestamp);
      if (elapsed < TOKEN_EXPIRY_MS) {
        return token;
      } else {
        // Token expirado en almacenamiento
        clearStoredToken();
      }
    }
  } catch (err) {
    console.warn("[Google Auth] No se pudo acceder a sessionStorage:", err);
  }
  return null;
}

function storeToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
    sessionStorage.setItem(STORAGE_KEY_TIME, String(Date.now()));
    console.log("[Google Auth] Token almacenado en sessionStorage.");
  } catch (err) {
    console.warn("[Google Auth] No se pudo escribir en sessionStorage:", err);
  }
}

function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_TIME);
    console.log("[Google Auth] Token eliminado de sessionStorage.");
  } catch (err) {
    console.warn("[Google Auth] No se pudo limpiar sessionStorage:", err);
  }
}

// ============================================================
// 3. GESTIÓN DE TOKEN EN MEMORIA
// ============================================================

export function getCachedAccessToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken;

  // Intentar restaurar desde sessionStorage
  const stored = getStoredToken();
  if (stored) {
    cachedAccessToken = stored;
    scheduleTokenRefresh(); // Programar renovación antes de que expire
    return cachedAccessToken;
  }
  return null;
}

export function setCachedAccessToken(token: string | null): void {
  if (token) {
    cachedAccessToken = token;
    storeToken(token);
    scheduleTokenRefresh();
  } else {
    clearCachedAccessToken();
  }
}

export function clearCachedAccessToken(): void {
  cachedAccessToken = null;
  clearStoredToken();
  if (tokenExpiryTimer) {
    clearTimeout(tokenExpiryTimer);
    tokenExpiryTimer = null;
  }
}

// ============================================================
// 4. RENOVACIÓN AUTOMÁTICA DEL TOKEN
// ============================================================

function scheduleTokenRefresh(): void {
  // Cancelar timer previo si existe
  if (tokenExpiryTimer) {
    clearTimeout(tokenExpiryTimer);
    tokenExpiryTimer = null;
  }

  // Obtener timestamp almacenado
  const storedTime = sessionStorage.getItem(STORAGE_KEY_TIME);
  if (!storedTime) return;

  const elapsed = Date.now() - Number(storedTime);
  const remaining = TOKEN_EXPIRY_MS - elapsed;
  if (remaining < 0) {
    // Ya expiró, limpiar
    clearCachedAccessToken();
    return;
  }

  // Programar renovación 5 minutos antes de que expire
  const refreshTime = Math.max(0, remaining - 5 * 60 * 1000);
  console.log(`[Google Auth] Token expirará en ${Math.round(remaining / 1000)}s. Renovación programada en ${Math.round(refreshTime / 1000)}s.`);

  tokenExpiryTimer = setTimeout(async () => {
    console.log("[Google Auth] Intentando renovar token automáticamente...");
    try {
      const newToken = await refreshGoogleToken();
      if (newToken) {
        setCachedAccessToken(newToken);
        console.log("[Google Auth] Token renovado exitosamente.");
      } else {
        console.warn("[Google Auth] No se pudo renovar el token. El usuario deberá autenticarse nuevamente.");
        clearCachedAccessToken();
        // Opcional: notificar al usuario
      }
    } catch (err) {
      console.error("[Google Auth] Error al renovar token:", err);
      clearCachedAccessToken();
    }
  }, refreshTime);
}

// ============================================================
// 5. AUTENTICACIÓN CON GOOGLE (con scopes mejorados)
// ============================================================

/**
 * Realiza una autenticación con Google, solicitando los scopes necesarios.
 * @param promptInteraction - Si es `true`, fuerza el popup de selección de cuenta. Si es `false`, intenta autenticación silenciosa.
 */
export async function requestGoogleAuthToken(promptInteraction: boolean = true): Promise<string | null> {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.send");
    provider.addScope("https://www.googleapis.com/auth/userinfo.email");
    provider.addScope("https://www.googleapis.com/auth/userinfo.profile");

    // Para intentar autenticación sin interacción (solo funciona si ya hay sesión activa)
    if (!promptInteraction) {
      provider.setCustomParameters({ prompt: "none" });
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;

    if (token) {
      setCachedAccessToken(token);
      console.log("[Google Auth] Autenticación exitosa. Token obtenido.");
    } else {
      console.warn("[Google Auth] No se obtuvo token de acceso.");
      clearCachedAccessToken();
    }
    return token;
  } catch (err: any) {
    // Si falló con prompt: "none", reintentar con interacción
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
      console.warn("[Google Auth] El usuario canceló el popup. No se renovó el token.");
    } else if (err.code === "auth/unauthorized-domain") {
      console.error("[Google Auth] El dominio no está autorizado para Firebase. Verifica la configuración de OAuth.");
    } else {
      console.error("[Google Auth] Error en autenticación:", err);
    }
    clearCachedAccessToken();
    throw err;
  }
}

/**
 * Intenta renovar el token de acceso sin interacción (o con interacción si falla).
 * Útil para refrescar automáticamente.
 */
export async function refreshGoogleToken(): Promise<string | null> {
  try {
    // Primero intentar sin interacción (si el usuario tiene sesión activa)
    return await requestGoogleAuthToken(false);
  } catch (error) {
    // Si falla, intentar con interacción (popup)
    console.warn("[Google Auth] La renovación silenciosa falló. Solicitando interacción del usuario.");
    return await requestGoogleAuthToken(true);
  }
}

// ============================================================
// 6. ENVÍO DE CORREOS CON GMAIL API (actualizado con manejo de errores)
// ============================================================

/**
 * Envía un correo electrónico usando la API de Gmail.
 * @param accessToken - Token de acceso de OAuth (válido).
 * @param to - Destinatario.
 * @param subject - Asunto.
 * @param htmlBody - Cuerpo del mensaje en HTML.
 * @returns `true` si se envió correctamente, `false` en caso contrario.
 */
export async function sendGmail(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  if (!accessToken) {
    console.error("[Gmail API Error] Access Token no proporcionado.");
    return false;
  }

  try {
    // Construir el mensaje MIME
    const emailParts = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${btoa(encodeURIComponent(subject).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlBody
    ];
    const rawEmail = emailParts.join("\r\n");

    // Codificar a base64url
    const base64Encoded = btoa(unescape(encodeURIComponent(rawEmail))); // Nota: unescape está obsoleto, pero es la forma más limpia para base64 de Unicode
    const base64urlMime = base64Encoded
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    console.log(`[Gmail API] Enviando mensaje a ${to}...`);

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64urlMime }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[Gmail API] Error al enviar:", errorData);
      // Si el token expiró, limpiarlo para forzar renovación
      if (response.status === 401) {
        clearCachedAccessToken();
        console.warn("[Gmail API] Token expirado. Limpiando caché.");
      }
      return false;
    }

    console.log("[Gmail API] Mensaje enviado correctamente.");
    return true;
  } catch (err) {
    console.error("[Gmail API] Excepción al enviar:", err);
    return false;
  }
}

// ============================================================
// 7. INICIALIZACIÓN: restaurar token al cargar la página
// ============================================================

// Al importar este módulo, intentamos restaurar el token desde sessionStorage.
const initialToken = getStoredToken();
if (initialToken) {
  cachedAccessToken = initialToken;
  scheduleTokenRefresh();
  console.log("[Google Auth] Token restaurado desde sessionStorage.");
} else {
  console.log("[Google Auth] No se encontró token almacenado.");
}
