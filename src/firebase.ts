import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Safe fallback Firebase configuration (prevents build failures when JSON config isn't under git)
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sara-35270",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:597030236952:web:318b62730ecf6713c6246d",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDzy-Bq0RhiH6dif0tQWpvPCsJ-3FE-wgs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sara-35270.firebaseapp.com",
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-3d451c93-9738-452c-87b2-4b4817e76096",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sara-35270.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "597030236952",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

// Initialize Firebase App instance
const app = initializeApp(firebaseConfig);

// Initialize Firestore with standard Enterprise database Id
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Authentication Provider
export const auth = getAuth(app);

// Provider instance for Google Auth
export const googleProvider = new GoogleAuthProvider();

// Standard handle list / write errors
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous
    },
    operationType,
    path
  };
  console.error('[Firestore Error Details]: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Simple test connection
async function testConnection() {
  try {
    const { doc, getDocFromServer } = await import("firebase/firestore");
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore client is offline. Verify configuration parameters.");
    }
  }
}
testConnection();
