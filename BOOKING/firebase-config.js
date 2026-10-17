import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    onSnapshot,
    deleteDoc,
    updateDoc,
    addDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyC3JbrOoBXTtDNH-7tDbCzT6tECKJCtdjE",
    authDomain: "hacked-wifi-3d8ac.firebaseapp.com",
    projectId: "hacked-wifi-3d8ac",
    storageBucket: "hacked-wifi-3d8ac.firebasestorage.app",
    messagingSenderId: "893227799683",
    appId: "1:893227799683:web:7f7a63cc80fea8284a77b6",
    measurementId: "G-STXY8VVBLZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
    db,
    auth,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    onSnapshot,
    deleteDoc,
    updateDoc,
    addDoc,
    Timestamp,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
};