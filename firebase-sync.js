/* Firebase synchronization for the SAN-DE-CHARLINE app.
 * Load Firebase compat app/auth/firestore SDKs and this file AFTER the app's
 * existing inline script so its global state, render(), and saveState() exist.
 */
(() => {
  const firebaseConfig = {
    apiKey: "AIzaSyCYl897MruSq05ex9wwSMsKBmfvufNp9dk",
    authDomain: "san-de-charline.firebaseapp.com",
    projectId: "san-de-charline",
    storageBucket: "san-de-charline.firebasestorage.app",
    messagingSenderId: "388636044985",
    appId: "1:98badd1ed7bc6c8eb6b568",
    measurementId: "G-9KVMPTRT4G"
  };

  const status = document.createElement("span");
  status.id = "firebaseStatus";
  status.className = "subtitle";
  status.style.marginRight = "8px";
  const loginButton = document.createElement("button");
  loginButton.id = "firebaseLoginButton";
  loginButton.className = "btn btn-outline";
  loginButton.type = "button";
  const topbar = document.querySelector(".topbar-inner");
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end";
  controls.append(status, loginButton);
  topbar.appendChild(controls);

  const setStatus = text => { status.textContent = text; };
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);
  const provider = new firebase.auth.GoogleAuthProvider();
  let cloudReady = false;
  let unsubscribe = null;
  let signedInUser = null;
  const localSaveState = window.saveState;

  // Keep the existing browser backup and mirror every application change to
  // the signed-in user's private Firestore document.
  window.saveState = function saveStateWithCloudSync() {
    localSaveState();
    if (!cloudReady || !signedInUser) return;
    const ref = userStateRef(signedInUser.uid);
    ref.set({ state: window.state || state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(error => {
        console.error("Firebase save failed:", error);
        setStatus("Error al sincronizar; tus datos siguen guardados en este navegador");
      });
  };

  function userStateRef(uid) {
    return db.doc(`apps/san-de-charline/users/${uid}/state/data`);
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem("sistema_san_dic_ene_v2") ||
        localStorage.getItem("sistema_san_dic_ene_v1");
      if (raw) return JSON.parse(raw);
    } catch (error) {
      console.error("Could not read local app data:", error);
    }
    return state;
  }

  function applyRemoteState(remoteState) {
    if (!remoteState || !remoteState.config || !Array.isArray(remoteState.participants)) {
      throw new Error("Los datos guardados en Firestore no tienen el formato esperado.");
    }
    state = remoteState;
    localStorage.setItem("sistema_san_dic_ene_v2", JSON.stringify(state));
    window.render();
  }

  loginButton.addEventListener("click", async () => {
    if (auth.currentUser) {
      try {
        await auth.signOut();
      } catch (error) {
        console.error(error);
        setStatus("No se pudo cerrar sesión");
      }
      return;
    }
    try {
      await auth.signInWithPopup(provider);
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setStatus(error.code === "auth/unauthorized-domain"
        ? "Dominio no autorizado en Firebase Authentication"
        : "No se pudo iniciar sesión con Google");
    }
  });

  auth.onAuthStateChanged(async user => {
    cloudReady = false;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    signedInUser = user || null;

    if (!user) {
      loginButton.textContent = "🔐 Iniciar sesión con Google";
      setStatus("Sincronización desactivada");
      return;
    }

    loginButton.textContent = "Cerrar sesión";
    setStatus(`Conectando: ${user.email || "cuenta Google"}…`);
    try {
      const ref = userStateRef(user.uid);
      const snapshot = await ref.get();
      if (snapshot.exists && snapshot.data().state) {
        applyRemoteState(snapshot.data().state);
      } else {
        // First login: migrate this browser's saved state into this user's cloud copy.
        const localState = loadLocalState();
        await ref.set({ state: localState, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        state = localState;
        window.render();
      }

      cloudReady = true;
      setStatus(`Sincronizado · ${user.email || "Google"}`);
      unsubscribe = ref.onSnapshot(snapshotNow => {
        if (!snapshotNow.exists || !snapshotNow.data().state) return;
        try {
          applyRemoteState(snapshotNow.data().state);
          setStatus(`Sincronizado · ${user.email || "Google"}`);
        } catch (error) {
          console.error(error);
          setStatus("Error: datos en Firestore inválidos");
        }
      }, error => {
        console.error("Firestore listener failed:", error);
        setStatus("Error de acceso a Firestore; revisa las reglas");
      });
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      setStatus(error.code === "permission-denied"
        ? "Acceso denegado: revisa las reglas publicadas de Firestore"
        : "No se pudo conectar con Firestore");
    }
  });
})();
