
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
// import { getDatabase, type Database } from 'firebase/database'; // No longer needed for game state

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL; // Still needed for potential Genkit/other Firebase services
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  databaseURL: databaseURL, // Required if any part of Firebase (like Genkit connector) needs it
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
  measurementId: measurementId,
};

let app: FirebaseApp | undefined;
// let database: Database | undefined; // Game state no longer uses RTDB directly from context

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
}

// Database instance is not explicitly created here for game context anymore.
// If Genkit or other services need it, they would initialize it or get it from 'app'.

export { app }; // Export only app, or database if other parts of app need it directly
// export { app, database }; // If other non-game-context parts need DB
