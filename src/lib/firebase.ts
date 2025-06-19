
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

if (!databaseURL) {
  console.error(
    'CRITICAL Firebase Configuration Error: NEXT_PUBLIC_FIREBASE_DATABASE_URL is not defined in your .env file. ' +
    'Please ensure it is set correctly. It should look like: ' +
    'https://<YOUR-PROJECT-ID>.firebaseio.com or https://<YOUR-PROJECT-ID>-default-rtdb.<REGION>.firebasedatabase.app. ' +
    'You can find this value in your Firebase project settings.'
  );
} else if (!databaseURL.startsWith('https://') || !(databaseURL.includes('.firebaseio.com') || databaseURL.includes('.firebasedatabase.app'))) {
  console.error(
    `CRITICAL Firebase Configuration Error: NEXT_PUBLIC_FIREBASE_DATABASE_URL ("${databaseURL}") appears to be malformed. ` +
    'Please ensure it is a valid Firebase Realtime Database URL from your Firebase project settings.'
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

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

let database;
try {
  database = getDatabase(app);
} catch (error) {
  console.error("Firebase Database Initialization Error. This likely means your NEXT_PUBLIC_FIREBASE_DATABASE_URL is still incorrect even if it passed basic checks.", error);
  // Depending on how critical this is, you might want to re-throw or handle differently
  // For now, we'll let the app proceed and Firebase SDK might show further errors.
  // If database is crucial for app start, you might throw here:
  // throw new Error("Failed to initialize Firebase Database. Check NEXT_PUBLIC_FIREBASE_DATABASE_URL.");
}


export { app, database };
