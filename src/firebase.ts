import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfigJson from '../firebase-applet-config.json';

// Configure Firebase using environment variables (for Vercel/Production) with fallback to firebase-applet-config.json
export const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || firebaseConfigJson.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || firebaseConfigJson.authDomain,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || firebaseConfigJson.projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || firebaseConfigJson.storageBucket,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || firebaseConfigJson.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || firebaseConfigJson.appId,
};

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Target Firestore Database ID
// If custom VITE_FIREBASE_PROJECT_ID is configured without VITE_FIREBASE_DATABASE_ID, standard '(default)' is used.
const isCustomProject = Boolean(
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID !== firebaseConfigJson.projectId
);

const customDbId =
  (import.meta.env.VITE_FIREBASE_DATABASE_ID as string) ||
  (isCustomProject
    ? undefined
    : (firebaseConfigJson.firestoreDatabaseId && firebaseConfigJson.firestoreDatabaseId !== '(default)'
      ? firebaseConfigJson.firestoreDatabaseId
      : undefined));

// Initialize Cloud Firestore with dedicated database ID
export const db = getFirestore(app, customDbId);

// Initialize Firebase Auth
export const auth = getAuth(app);

