// js/firebase-config.js

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    writeBatch, 
    getDocs,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBT_FLWM5sg5KLcglqLEpJUSbMUlmuJfE8",
  authDomain: "db-bs-pt.firebaseapp.com",
  projectId: "db-bs-pt",
  storageBucket: "db-bs-pt.firebasestorage.app",
  messagingSenderId: "58151370953",
  appId: "1:58151370953:web:b5495e8d38fd36855d0d18"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Exportar las instancias y funciones para usarlas en los demás módulos
export { 
    db, 
    collection, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    writeBatch, 
    getDocs,
    serverTimestamp 
};
