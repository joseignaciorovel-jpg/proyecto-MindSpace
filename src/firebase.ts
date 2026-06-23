import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ============================================================
// 1. VALIDACIÓN ESTRICTA DE VARIABLES DE ENTORNO (SIN FALLBACKS)
// ============================================================
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_DATABASE_ID',
] as const;

// Obtener variables de entorno (import.meta.env en Vite)
const env = import.meta.env;

// Verificar que todas las variables requeridas existan y no estén vacías
const missingVars = requiredEnvVars.filter(key => !env[key] || env[key].trim() === '');
if (missingVars.length > 0) {
  throw new Error(
    `❌ Faltan variables de entorno requeridas para Firebase: ${missingVars.join(', ')}.\n` +
    `Asegúrate de definirlas en tu archivo .env (con el prefijo VITE_) y de que estén disponibles en el build.`
  );
}

// Construir el objeto de configuración con los valores de las variables
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '', // Opcional
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '', // Opcional
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || '', // Opcional
};

// ============================================================
// 2. INICIALIZACIÓN DE FIREBASE
// ============================================================
const app = initializeApp(firebaseConfig);

// Firestore con el Database ID específico (obligatorio)
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Auth
export const auth = getAuth(app);

// Proveedor de Google
export const googleProvider = new GoogleAuthProvider();

// ============================================================
// 3. UTILIDADES DE MANEJO DE ERRORES (sin cambios, pero las mantenemos)
// ============================================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('[Firestore Error Details]: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// (Opcional) Prueba de conexión – la dejamos igual pero sin fallbacks
async function testConnection() {
  try {
    const { doc, getDocFromServer } = await import("firebase/firestore");
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('✅ Firestore connection successful.');
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("⚠️ Firestore client is offline. Verify your configuration and network.");
    } else {
      console.error('❌ Firestore connection test failed:', error);
    }
  }
}
testConnection();
