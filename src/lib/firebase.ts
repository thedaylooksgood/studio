
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

console.log("Attempting to load Firebase config from environment variables:");
console.log("NEXT_PUBLIC_FIREBASE_API_KEY:", apiKey ? "Loaded" : "MISSING or empty");
console.log("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:", authDomain ? "Loaded" : "MISSING or empty");
console.log("NEXT_PUBLIC_FIREBASE_DATABASE_URL:", databaseURL ? databaseURL : "MISSING or empty");
console.log("NEXT_PUBLIC_FIREBASE_PROJECT_ID:", projectId ? "Loaded" : "MISSING or empty");
// Add logs for other variables if needed for debugging

if (!databaseURL) {
  console.error(
    'CRITICAL Firebase Configuration Error: NEXT_PUBLIC_FIREBASE_DATABASE_URL is not defined. ' +
    'This is required for Realtime Database. Please ensure it is set in your environment variables (e.g., .env file or Vercel project settings). ' +
    'It should look like: https://<YOUR-PROJECT-ID>.firebaseio.com or https://<YOUR-PROJECT-ID>-default-rtdb.<REGION>.firebasedatabase.app.'
  );
} else if (!databaseURL.startsWith('https://') || !(databaseURL.includes('.firebaseio.com') || databaseURL.includes('.firebasedatabase.app'))) {
  console.error(
    `CRITICAL Firebase Configuration Error: NEXT_PUBLIC_FIREBASE_DATABASE_URL ("${databaseURL}") appears to be malformed. ` +
    'Please ensure it is a valid Firebase Realtime Database URL.'
  );
}

const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  databaseURL: databaseURL,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
  measurementId: measurementId,
};

let app: FirebaseApp | undefined;
let database: Database | undefined;

try {
  if (!getApps().length) {
    console.log("Initializing new Firebase app...");
    app = initializeApp(firebaseConfig);
    console.log("Firebase app initialized successfully.");
  } else {
    console.log("Getting existing Firebase app...");
    app = getApp();
    console.log("Existing Firebase app retrieved.");
  }
} catch (error) {
  console.error("CRITICAL Firebase App Initialization Error:", error);
  console.error("This usually means your Firebase config (apiKey, authDomain, projectId, etc.) is incorrect or missing critical values.");
}

if (app && databaseURL) { // Only try to get database if app initialized and databaseURL looks plausible
  try {
    console.log("Getting Firebase Realtime Database instance...");
    database = getDatabase(app);
    console.log("Firebase Realtime Database instance retrieved successfully.");
  } catch (error) {
    console.error("CRITICAL Firebase Database Initialization Error:", error);
    console.error("This typically occurs if NEXT_PUBLIC_FIREBASE_DATABASE_URL is malformed or missing, even if other config seems okay.");
    console.error("Received databaseURL for getDatabase:", databaseURL);
  }
} else {
  if (!app) {
    console.error("Firebase app object is not available. Cannot initialize Realtime Database.");
  }
  if (!databaseURL) {
    console.error("DATABASE_URL is missing or invalid. Cannot initialize Realtime Database.");
  }
}

export { app, database };
