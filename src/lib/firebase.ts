import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCnnwL2ETPbrGiX2C4xN5RSz4xU9wbfdYw",
  authDomain: "frota-3c-xxx.firebaseapp.com",
  projectId: "frota-3c-xxx",
  storageBucket: "frota-3c-xxx.firebasestorage.app",
  messagingSenderId: "670715687127",
  appId: "1:670715687127:web:727f33c6a91157838fc892",
  measurementId: "G-HMQFS44W74"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
