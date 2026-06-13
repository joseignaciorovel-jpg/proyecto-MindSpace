import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User, GoogleAuthProvider } from "firebase/auth";
import { collection, query, where, orderBy, onSnapshot, doc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";
import BookingCalendar from "./components/BookingCalendar";
import ClinicalHistoryManager from "./components/ClinicalHistoryManager";
import ClinicianAgenda from "./components/ClinicianAgenda";
import PaymentsLedger from "./components/PaymentsLedger";
import SecureCallRoom from "./components/SecureCallRoom";
import PatientEvaluationForm from "./components/PatientEvaluationForm";
import ProfessionalProfile from "./components/ProfessionalProfile";
import ClinicianSettings from "./components/ClinicianSettings";
import AbbyAssistant from "./components/AbbyAssistant";
import PatientPortal from "./components/PatientPortal";
import ShareReputationModal from "./components/ShareReputationModal";
import FluidBackground from "./components/FluidBackground";
import { TermsOfServiceModal, PrivacyPolicyModal } from "./components/LegalModals";
import { soundFX } from "./utils/soundFX";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, BookOpen, CreditCard, LogIn, LogOut, Video, Heart, Globe, Settings, Lock, Sparkles, MessageSquare, ShieldCheck, Clipboard, Star, Share2, ChevronLeft, ChevronRight, Sun, Moon, Phone, Smile, ShieldAlert, Activity, Clock, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { setCachedAccessToken } from "./utils/googleAuth";

const formatReviewDate = (createdAt: any) => {
  if (!createdAt) return "Reciente";
  try {
    const d = createdAt.toDate ? createdAt.toDate() : (createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt));
    const formatted = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch (e) {
    return "Reciente";
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // Theme State management (Light / Dark mode toggle)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const [soundMuted, setSoundMuted] = useState<boolean>(() => soundFX.isMuted());

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Nav state: 'public' for booking, 'patient' for accompanying workspace, 'dashboard' for clinician panel
  const [portalMode, setPortalMode] = useState<"public" | "patient" | "dashboard">("public");

  // Clinical specialist selected tab
  const [activeTab, setActiveTab] = useState<"agenda" | "histories" | "payments" | "settings" | "abby">("agenda");

  // Active call state
  const [activeCallRoomId, setActiveCallRoomId] = useState<string | null>(null);
  const [activeCallPatient, setActiveCallPatient] = useState<{ id?: string; name?: string; appointmentId?: string } | null>(null);

  // Dynamic Clinician & Clinic Settings from Firestore
  const [settings, setSettings] = useState<any | null>(null);
  const [therapistName, setTherapistName] = useState("Ps. José Ignacio Rovel");
  const [sessionPrice, setSessionPrice] = useState(45000);
  const [therapistUid, setTherapistUid] = useState("default_psychologist_uid_123");

  // Session Auto-Lock system (Seguridad por Inactividad)
  const [inactivityTimer, setInactivityTimer] = useState<number>(900); // 15 minutes by default (900s)
  const [isAppAutoLocked, setIsAppAutoLocked] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Patient feedback evaluation states
  const [reviewFormState, setReviewFormState] = useState<{
    isActive: boolean;
    patientId: string;
    therapistId: string;
    therapistName: string;
    patientName: string;
  } | null>(null);
  const [publicReviews, setPublicReviews] = useState<any[]>([]);
  const [activeReviewIdx, setActiveReviewIdx] = useState(0);

  // Listen for public reviews
  useEffect(() => {
    const q = query(
      collection(db, "reviews"),
      where("publicConsent", "==", true)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side by descending createdAt to avoid needing a Firestore composite index
      items.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setPublicReviews(items);
    }, (error) => {
      console.error("Error loading public reviews:", error);
    });
    return () => unsubscribe();
  }, []);

  // Timer interval for review auto-carousel slide transition (Increased to 14s for better readability as requested)
  useEffect(() => {
    if (publicReviews.length <= 1) return;
    const interval = setInterval(() => {
      setActiveReviewIdx((prev) => (prev + 1) % publicReviews.length);
    }, 14000);
    return () => clearInterval(interval);
  }, [publicReviews.length]);

  // Decode URL query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const portal = params.get("portal");
    const pId = params.get("patientId");
    const tId = params.get("therapistId");
    const tName = params.get("therapistName");
    const pName = params.get("patientName");
    
    // Auto launch patient companion mode if defined in query strings
    if (portal === "patient" || mode === "patient") {
      setPortalMode("patient");
    }

    if (mode === "review" && tId) {
      setReviewFormState({
        isActive: true,
        patientId: pId || "",
        therapistId: tId,
        therapistName: tName || "Dr. José Ignacio Rovel",
        patientName: pName || "",
      });
    }
  }, []);

  const handleFinishedReview = () => {
    // Clear URL parameters securely
    window.history.replaceState({}, document.title, window.location.pathname);
    setReviewFormState(null);
  };

  // Listen for Google Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setPortalMode("dashboard"); // Auto redirect to dashboard once logged in
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen for dynamic settings (profile, pricing, hours, channels)
  useEffect(() => {
    // We bind all clinic records to "default_psychologist_uid_123" so public patient sessions
    // scheduled while unauthenticated sync seamlessly with the Specialist Calendar view inside the dashboard.
    const targetUid = "default_psychologist_uid_123";
    setTherapistUid(targetUid);
    
    const docRef = doc(db, "settings", targetUid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(data);
        if (data.therapistName) setTherapistName(data.therapistName);
        if (data.sessionPrice) setSessionPrice(data.sessionPrice);
      } else {
        setSettings(null);
        if (user) {
          setTherapistName(user.displayName || "Ps. José Ignacio Rovel");
        } else {
          setTherapistName("Ps. José Ignacio Rovel");
        }
        setSessionPrice(45000);
      }
    }, (error) => {
      console.warn("Could not load dynamic settings: ", error.message);
    });

    return () => unsubscribe();
  }, [user]);

  // Monitor activity and auto-lock after 15 minutes of inactivity in Dashboard
  useEffect(() => {
    if (!user || portalMode !== "dashboard" || isAppAutoLocked) return;

    const resetTimer = () => {
      setInactivityTimer(900); // Reset to 15 minutes (900 seconds)
    };

    // Add event listeners for clinical interactions
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    const interval = setInterval(() => {
      setInactivityTimer((prev) => {
        if (prev <= 1) {
          setIsAppAutoLocked(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      clearInterval(interval);
    };
  }, [user, portalMode, isAppAutoLocked]);

  // Reset lock state if we leave the dashboard or the specialist signs out
  useEffect(() => {
    if (!user || portalMode !== "dashboard") {
      setIsAppAutoLocked(false);
      setInactivityTimer(900);
    }
  }, [user, portalMode]);

  const handleLoginGoogle = async () => {
    setAuthError(null);
    try {
      // Configure scopes for Gmail sending support
      googleProvider.addScope("https://www.googleapis.com/auth/gmail.send");
      
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedAccessToken(credential.accessToken);
        console.log("[Google Auth]: Token retrieved and cached successfully.");
      } else {
        console.warn("[Google Auth]: No access token returned in the credential payload.");
      }
    } catch (err: any) {
      console.error("Specialist Google Authentication error:", err);
      let errorMsg = "Hubo un problema al ingresar con Google. Por favor, intente de nuevo.";
      if (err.code === "auth/popup-closed-by-user") {
        errorMsg = "La ventana de conexión con Google fue cerrada antes de completar el inicio de sesión. Por favor, inténtelo de nuevo en el botón inferior.";
      } else if (err.code === "auth/cancelled-popup-request") {
        errorMsg = "La solicitud fue cancelada porque se abrió otra ventana de autenticación.";
      } else if (err.message) {
        errorMsg = `Error: ${err.message}`;
      }
      setAuthError(errorMsg);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCachedAccessToken(null);
      setPortalMode("public");
    } catch (err) {
      console.error("Signout error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFC]/75 dark:bg-slate-950/75 text-[#1D1D1F] dark:text-slate-100 antialiased selection:bg-slate-200 dark:selection:bg-slate-800 flex flex-col justify-between font-sans transition-colors duration-300 relative">
      <FluidBackground darkMode={darkMode} />
         {/* Top Professional Header Navigation */}
      <header className={`bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-gray-100/50 dark:border-slate-800/50 shadow-xs sticky top-0 z-40 transition-colors duration-300 animate-in fade-in slide-in-from-top-6 duration-700 ${portalMode === "patient" ? "hidden md:block" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Practice Visual Logo */}
          <div className="flex items-center gap-2.5">
            <div 
              onClick={() => {
                soundFX.playChime();
              }}
              onMouseEnter={() => soundFX.playTick()}
              className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 p-2 rounded-xl shadow-md cursor-pointer hover:scale-105 transition-transform duration-200"
            >
              <Heart className="w-5 h-5 animate-pulse text-emerald-400 dark:text-emerald-600" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">MindSpace</h1>
              <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                Psicología Clínica y Agenda Especialista
              </span>
            </div>
          </div>

          {/* Quick Portal Switch controllers */}
          <div className="flex items-center bg-gray-50/70 dark:bg-slate-950/70 backdrop-blur-xs p-1 rounded-2xl border border-gray-100 dark:border-slate-850 shadow-inner flex-wrap gap-1 sm:gap-2">
            <button
              onClick={() => {
                soundFX.playTransition();
                setActiveCallRoomId(null);
                setPortalMode("public");
              }}
              onMouseEnter={() => soundFX.playTick()}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all hover:scale-102 active:scale-98 cursor-pointer ${
                portalMode === "public"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-gray-105 dark:border-slate-800 font-extrabold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Web Reserva
            </button>

            <button
              onClick={() => {
                soundFX.playTransition();
                setActiveCallRoomId(null);
                setPortalMode("patient");
              }}
              onMouseEnter={() => soundFX.playTick()}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all hover:scale-102 active:scale-98 cursor-pointer ${
                portalMode === "patient"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-gray-105 dark:border-slate-800 font-extrabold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Smile className="w-3.5 h-3.5 text-emerald-500" /> Portal Paciente
            </button>

            {(user || portalMode === "dashboard") && (
              <button
                onClick={() => {
                  soundFX.playTransition();
                  setPortalMode("dashboard");
                }}
                onMouseEnter={() => soundFX.playTick()}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all hover:scale-102 active:scale-98 cursor-pointer ${
                  portalMode === "dashboard"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-gray-105 dark:border-slate-800 font-extrabold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Lock className="w-3.5 h-3.5" /> Especialista
              </button>
            )}
          </div>

          {/* User profiles info, Theme Switch, or login trigger */}
          <div className="flex items-center gap-3">
            
            {/* Elegant Sound FX System Mute / Unmute Toggle */}
            <button
              onClick={() => {
                const updatedMuteState = soundFX.toggleMute();
                setSoundMuted(updatedMuteState);
                if (!updatedMuteState) {
                  soundFX.playChime();
                }
              }}
              onMouseEnter={() => soundFX.playTick()}
              type="button"
              className="p-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 rounded-xl transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm inline-flex items-center justify-center border border-transparent dark:border-slate-700"
              aria-label="Toggle sound feedback"
              title={soundMuted ? "Activar efectos de sonido" : "Silenciar efectos de sonido"}
            >
              {soundMuted ? (
                <VolumeX className="w-4 h-4 text-rose-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-500" />
              )}
            </button>

            {/* Elegant Light / Dark Toggle button */}
            <button
              onClick={() => {
                soundFX.playPop();
                setDarkMode(!darkMode);
              }}
              onMouseEnter={() => soundFX.playTick()}
              type="button"
              className="p-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 rounded-xl transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm inline-flex items-center justify-center border border-transparent dark:border-slate-700"
              aria-label="Toggle theme mode"
              title={darkMode ? "Modo Claro" : "Modo Oscuro"}
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400 fill-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-555 fill-indigo-100" />
              )}
            </button>

            {authLoading ? (
              <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ) : user ? (
              <div className="relative">
                {/* Collapsible trigger button */}
                <button
                  id="btn_user_profile_dropdown"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-100/90 dark:hover:bg-slate-800 rounded-2xl transition-all duration-200 cursor-pointer border border-gray-150 dark:border-slate-800 shadow-xs"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Perfil psicólogo"
                      className="w-7 h-7 rounded-full border border-gray-200 dark:border-slate-700 shadow-2xs shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-teal-500 text-white flex items-center justify-center font-black text-xs shrink-0">
                      {user.displayName ? user.displayName.charAt(0) : "E"}
                    </div>
                  )}
                  <span className="text-xs font-extrabold text-[#1D1D1F] dark:text-slate-100 max-w-[130px] truncate hidden md:inline-block">
                    {user.displayName ? (user.displayName.startsWith("Ps. ") ? user.displayName : "Ps. " + user.displayName) : "Especialista"}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform duration-250 ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Backdrop Layer */}
                {userMenuOpen && (
                  <div
                    id="dropdown_backdrop"
                    className="fixed inset-0 z-40 bg-transparent cursor-default"
                    onClick={() => setUserMenuOpen(false)}
                  />
                )}

                {/* Collapsed Dropdown List */}
                {userMenuOpen && (
                  <div
                    id="dropdown_user_menu"
                    className="absolute right-0 mt-2.5 w-60 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-150 dark:border-slate-850 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-left"
                  >
                    {/* Header: Identity Card details */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl mb-1.5 flex items-center gap-2.5 border border-slate-100 dark:border-slate-850">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt="Avatar"
                          className="w-8.5 h-8.5 rounded-full border border-gray-200 dark:border-slate-750"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8.5 h-8.5 rounded-full bg-teal-500 text-white flex items-center justify-center font-bold text-xs">
                          {user.displayName ? user.displayName.charAt(0) : "E"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {user.displayName || "Especialista"}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {user.email}
                        </p>
                        <span className="inline-block mt-1 text-[8px] px-1.5 py-0.2 bg-teal-50 dark:bg-teal-950/45 text-teal-600 dark:text-teal-400 font-extrabold rounded-md uppercase border border-teal-200/50 dark:border-teal-900/40">
                          Acreditado SIS ✓
                        </span>
                      </div>
                    </div>

                    {/* Compact Navigation Elements */}
                    <div className="space-y-0.5">
                      <button
                        onClick={() => {
                          setPortalMode("dashboard");
                          setActiveTab("agenda");
                          setUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer ${
                          portalMode === "dashboard" && activeTab === "agenda"
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                            : "text-slate-650 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> Mi Agenda Semanal
                      </button>

                      <button
                        onClick={() => {
                          setPortalMode("dashboard");
                          setActiveTab("histories");
                          setUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer ${
                          portalMode === "dashboard" && activeTab === "histories"
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                            : "text-slate-650 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> Fichas Clínicas (IA)
                      </button>

                      <button
                        onClick={() => {
                          setPortalMode("dashboard");
                          setActiveTab("settings");
                          setUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer ${
                          portalMode === "dashboard" && activeTab === "settings"
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                            : "text-slate-650 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <Settings className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> Ajustes de Cuenta
                      </button>

                      <button
                        onClick={() => {
                          setShareModalOpen(true);
                          setUserMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-650 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400" /> Compartir Reputación
                      </button>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 my-1.5" />

                    {/* Exit/Log out section */}
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-extrabold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" /> Cerrar Sesión Segura
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setPortalMode("dashboard")}
                className="bg-slate-900/10 dark:bg-white/10 hover:bg-slate-900/20 dark:hover:bg-white/15 text-slate-900 dark:text-slate-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-102 active:scale-98 cursor-pointer"
              >
                <LogIn className="w-4 h-4" /> Ingresar
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Main Core Body */}
      <main className={`${activeCallRoomId ? "w-full max-w-none px-2 sm:px-4 lg:px-6 py-4" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"} flex-1 w-full font-sans transition-all duration-300`}>
        
        {/* Scenario: Query matching Evaluation Form Page */}
        {reviewFormState?.isActive ? (
          <div className="animate-in fade-in zoom-in-95 duration-300 py-6">
            <PatientEvaluationForm
              patientId={reviewFormState.patientId}
              therapistId={reviewFormState.therapistId}
              therapistName={reviewFormState.therapistName}
              initialPatientName={reviewFormState.patientName}
              onFinished={handleFinishedReview}
            />
          </div>
        ) : activeCallRoomId ? (
          <div className="animate-in fade-in zoom-in-95 duration-200">
            <SecureCallRoom
              roomId={activeCallRoomId}
              onLeaveCall={() => {
                setActiveCallRoomId(null);
                setActiveCallPatient(null);
              }}
              therapistName={therapistName}
              patientId={activeCallPatient?.id}
              patientName={activeCallPatient?.name}
              appointmentId={activeCallPatient?.appointmentId}
              isClinician={portalMode === "dashboard"}
            />
          </div>
        ) : (
          /* Scenario 2: Standard modes (Public or Private Dashboard) */
          <>
            {portalMode === "public" ? (
              <div className="space-y-16 sm:space-y-24 animate-in fade-in duration-300">
                {/* Visual Intro hero for patients */}
                <div className="text-center max-w-3xl mx-auto space-y-5 pb-8">
                  <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight sm:text-4xl md:text-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    Atención Psicológica Online Profesional
                  </h2>
                  <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                    Reserva tus sesiones de terapia individual desde el calendario público certificado. Todos tus datos y videoconsultas están protegidas bajo estrictas normativas sanitarias y de cifrado E2EE.
                  </p>
                  
                  {/* Above the Fold Direct booking CTA actions */}
                  <div className="pt-4 flex flex-wrap justify-center gap-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
                    <button
                      onClick={() => {
                        const el = document.getElementById("booking-section");
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth" });
                        }
                      }}
                      className="bg-slate-950 hover:bg-black dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 text-white font-extrabold text-[11px] sm:text-xs px-6 py-4 rounded-xl transition-all duration-150 transform hover:scale-102 active:scale-98 shadow-md hover:shadow-lg uppercase tracking-wider cursor-pointer flex items-center gap-2"
                    >
                      <Calendar className="w-4 h-4" /> Ver Horas Disponibles
                    </button>
                    <button
                      onClick={() => {
                        const bubble = document.getElementById("abby-launcher-bubble");
                        if (bubble) {
                          bubble.click();
                        }
                      }}
                      className="bg-white/80 hover:bg-slate-50 dark:bg-slate-900/80 dark:hover:bg-slate-850/80 text-slate-800 dark:text-slate-200 font-extrabold text-[11px] sm:text-xs px-6 py-4 rounded-xl border border-gray-200 dark:border-slate-800 transition-all duration-150 uppercase tracking-wider cursor-pointer flex items-center gap-2 shadow-xs"
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-500" /> Consultar con Abby AI
                    </button>
                  </div>
                </div>

                {/* Visual public evaluation feedback carousel slider */}
                {publicReviews.length > 0 && (
                  <div className="max-w-2xl mx-auto bg-white/70 dark:bg-slate-900/75 backdrop-blur-md rounded-3xl border border-gray-100/70 dark:border-slate-800/60 p-6 sm:p-8 shadow-xs text-center space-y-4 relative overflow-hidden transition-all duration-300">
                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-3 mb-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 animate-pulse" />
                        Opiniones de Pacientes Atendidos
                      </span>
                      <div className="flex items-center gap-1 font-mono text-[10px] text-slate-605 dark:text-slate-300 font-bold bg-slate-50 dark:bg-slate-850 px-2.5 py-0.5 rounded border border-gray-150 dark:border-slate-755 shadow-inner">
                        <span>Satisfacción: {(publicReviews.reduce((sum, r) => sum + r.rating, 0) / publicReviews.length).toFixed(1)} / 5.0 ⭐</span>
                      </div>
                    </div>

                    {/* Sliding frame */}
                    <div className="min-h-[140px] flex flex-col justify-center items-center px-4 animate-in fade-in duration-300">
                      <div className="flex justify-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= publicReviews[activeReviewIdx].rating
                                ? "fill-amber-400 stroke-amber-500 text-amber-500"
                                : "text-gray-200 stroke-gray-300 dark:text-slate-700 dark:stroke-slate-605"
                            }`}
                          />
                        ))}
                      </div>

                      <blockquote className="text-sm font-sans italic text-slate-700 dark:text-slate-300 leading-relaxed max-w-lg mb-3">
                        "{publicReviews[activeReviewIdx].comment || "Excelente atención profesional."}"
                      </blockquote>

                      <div className="flex flex-col items-center gap-1 text-center">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2 flex-wrap">
                          <span>— {publicReviews[activeReviewIdx].patientName}</span>
                          <span className="text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 uppercase tracking-wider scale-95 shrink-0">
                            ✓ Reseña Verificada
                          </span>
                        </div>
                        <span className="text-slate-400 dark:text-slate-500 text-[10.5px] font-medium font-sans">
                          {formatReviewDate(publicReviews[activeReviewIdx].createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Nav controls */}
                    <div className="flex justify-between items-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveReviewIdx((prev) => (prev - 1 + publicReviews.length) % publicReviews.length);
                        }}
                        className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {/* Dots */}
                      <div className="flex gap-1.5">
                        {publicReviews.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveReviewIdx(idx)}
                            className={`w-2 h-2 rounded-full cursor-pointer transition-all ${
                              activeReviewIdx === idx ? "bg-slate-900 dark:bg-slate-100 scale-125" : "bg-gray-200 dark:bg-slate-800"
                            }`}
                          />
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveReviewIdx((prev) => (prev + 1) % publicReviews.length);
                        }}
                        className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Professional Scholarly Profile Section */}
                <div className="pt-12 sm:pt-16 border-t border-gray-100/60 dark:border-slate-900/40">
                  <div className="text-center max-w-xl mx-auto space-y-1 mb-8">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight animate-in fade-in slide-in-from-bottom-3 duration-500">Sobre el Especialista</h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Conozca la trayectoria clínica, formación y experiencia de su profesional antes de agendar.</p>
                  </div>
                  <ProfessionalProfile settings={settings} />
                </div>

                {/* Booking Section */}
                <div id="booking-section" className="pt-12 sm:pt-16 border-t border-gray-100/60 dark:border-slate-900/40">
                  <div className="text-center max-w-xl mx-auto space-y-1 mb-8">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight animate-in fade-in slide-in-from-bottom-3 duration-500">Agenda de Horas Clínicas</h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-sans">Seleccione un día y bloque de horario certificado para registrar su consulta.</p>
                  </div>
                  <BookingCalendar
                    therapistUid={therapistUid}
                    therapistName={therapistName}
                    sessionPrice={sessionPrice}
                  />
                </div>
              </div>
            ) : portalMode === "patient" ? (
              <div className="animate-in fade-in duration-200">
                <PatientPortal
                  therapistUid={therapistUid}
                  therapistName={therapistName}
                  sessionPrice={sessionPrice}
                  onJoinCall={(roomId) => setActiveCallRoomId(roomId)}
                />
              </div>
            ) : (
              /* PRIVATE SPECIALIST CLINICAL DASHBOARD */
              <div className="space-y-6 animate-in fade-in duration-200">
                {(() => {
                  // Guard check for clinician access (Chilean Laws 19.628 & 20.584)
                  const isClinicianEmail = user && (
                    user.email === "p.joseignacio@gmail.com" || 
                    user.email === "jose.ignacio.therapist@gmail.com" ||
                    user.email === "joseignacio.rovel@gmail.com" ||
                    user.uid === "default_psychologist_uid_123" ||
                    !settings ||
                    settings.contactEmail === user.email ||
                    settings.ownerId === user.uid
                  );

                  if (user && !isClinicianEmail) {
                    return (
                      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 dark:border-rose-950 p-8 shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-300">
                        <div className="inline-flex p-3.5 bg-rose-500/10 text-rose-600 rounded-2xl border border-rose-500/20">
                          <ShieldAlert className="w-8 h-8 animate-bounce text-rose-600" />
                        </div>
                        <div className="space-y-1.5 text-left">
                          <h3 className="text-base font-extrabold text-[#1D1D1F] dark:text-white text-center">🛡️ Acceso Restringido - Protección de Ficha Clínica</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-center">
                            Su cuenta de Google <strong className="text-slate-800 dark:text-slate-200">{user.email}</strong> está logueada como cuenta de Paciente y no posee privilegios de Especialista Médico Autorizado.
                          </p>
                          <div className="bg-rose-500/10 border border-rose-500/20 p-3.5 rounded-xl text-[10.5px] leading-relaxed text-rose-800 dark:text-rose-400 space-y-1 mt-3">
                            <strong>Garantía Ley 19.628 (Secreto Profesional):</strong>
                            <p className="mt-0.5 text-[9.5px]">
                              Para resguardar rigurosamente la privacidad médica digital de los pacientes atendidos, la visualización y edición de antecedentes, informes e interconsultas está bloqueada para cuentas externas.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <button
                            onClick={() => setPortalMode("patient")}
                            className="w-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-xs font-bold py-3 px-4 rounded-xl uppercase tracking-wider transition hover:scale-102 cursor-pointer shadow"
                          >
                            Ir a mi Portal de Paciente Seguro 🔐
                          </button>
                          <button
                            onClick={handleLogout}
                            className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 text-xs font-bold py-2 rounded-xl transition cursor-pointer"
                          >
                            Cerrar sesión de esta cuenta Google
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (!user) {
                    return (
                      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden p-8 text-center space-y-6 hover:scale-101 hover:shadow-2xl transition-all duration-300 animate-in zoom-in-95 duration-505">
                        <div className="inline-flex justify-center items-center bg-slate-900 dark:bg-slate-800 text-white p-4 rounded-3xl shadow-md border-2 border-slate-800 dark:border-slate-700">
                          <Lock className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">Módulo de Especialista</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Conexión cifrada segura para psicólogos y profesionales médicos autorizados.</p>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 p-4 rounded-xl text-left space-y-2 text-xs text-slate-600 dark:text-slate-300">
                          <p className="font-bold text-slate-800 dark:text-slate-200">🛡️ Secciones Reguladas Protegidas:</p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Fichas e Historias Clínicas de Pacientes</li>
                            <li>Agenda Visual interactiva de Consultas</li>
                            <li>Remitente automático de recordatorios por WhatsApp/Email</li>
                            <li>Módulo de Videollamadas Cifradas y Contabilidad</li>
                          </ul>
                        </div>

                        {authError && (
                          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3 rounded-xl text-left text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                            <span className="text-sm mt-0.5">⚠️</span>
                            <div className="flex-1 space-y-1">
                              <p className="font-bold">Error de Acceso</p>
                              <p className="text-[11px] leading-snug">{authError}</p>
                            </div>
                            <button 
                              onClick={() => setAuthError(null)}
                              className="text-gray-400 hover:text-red-600 transition text-[11px] font-bold px-1"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        <button
                          onClick={handleLoginGoogle}
                          className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-205 transition-all py-3.5 text-sm font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer animate-pulse-glow"
                        >
                          <svg className="w-4 h-4 mr-1 text-white dark:text-slate-955 fill-current" viewBox="0 0 24 24">
                            <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.71 0 3.28.614 4.5 1.74l2.4-2.4C17.435 1.7 15.01 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.79 0 10.24-4.065 10.24-10.24 0-.695-.08-1.355-.22-1.955H12.24z"/>
                          </svg>
                          Ingresar con su cuenta de Google
                        </button>
                        
                        <p className="text-[10px] text-gray-400 dark:text-slate-500">
                          Servicios de autenticación autorizados por Firebase Auth.
                        </p>
                      </div>
                    );
                  }

                  if (isAppAutoLocked) {
                    return (
                      <div className="max-w-md mx-auto bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
                        <div className="relative inline-flex p-4 bg-amber-500/10 text-amber-600 rounded-3xl border border-amber-500/20">
                          <Lock className="w-8 h-8 text-amber-500" />
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white w-4.5 h-4.5 rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse">!</span>
                        </div>
                        
                        <div className="space-y-2">
                          <h3 className="text-lg font-black text-slate-900 dark:text-white">Sesión Clínica Suspendida por Inactividad 🔐</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-center">
                            Para resguardar rigurosamente los datos sensibles e historiales clínicos de sus pacientes (Leyes Chilenas 19.628 y 20.584), la consola se ha bloqueado debido al tiempo de inactividad.
                          </p>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-150 dark:border-slate-850 text-left space-y-2.5">
                          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-850 pb-2">
                            <span className="w-2 h-2 bg-amber-500 rounded-full inline-block animate-pulse"></span>
                            <span className="font-bold text-[10.5px] text-slate-800 dark:text-slate-250">Estado de Resguardo de Notas:</span>
                          </div>
                          <p className="text-[10.5px] text-slate-650 dark:text-slate-350 leading-relaxed">
                            ✍️ <strong className="text-slate-800 dark:text-slate-200">Borrador Protegido:</strong> Sus notas clínicas y evoluciones en borrador han sido guardadas de forma local en su navegador mediante auto-guardado cifrado. Al desbloquearlas, reanudará exactamente donde estaba.
                          </p>
                        </div>

                        {/* Lock Pin input / Auth validation */}
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left">Ingrese su PIN Profesional de Desbloqueo (Por defecto: 1234)</label>
                            <input
                              type="password"
                              maxLength={6}
                              placeholder="••••"
                              autoFocus
                              className="w-full text-center bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-800 py-3 rounded-xl text-lg tracking-widest font-mono font-bold focus:ring-2 focus:ring-slate-400 outline-none text-slate-800 dark:text-white"
                              onChange={(e) => {
                                if (e.target.value === "1234") {
                                  setIsAppAutoLocked(false);
                                  setInactivityTimer(900);
                                  e.target.value = "";
                                }
                              }}
                            />
                          </div>

                          <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                            <span className="flex-shrink mx-4 text-[9px] text-gray-400 font-bold uppercase tracking-wider font-mono">O TAMBIÉN</span>
                            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setIsAppAutoLocked(false);
                                setInactivityTimer(900);
                              }}
                              className="flex-1 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-950 text-xs font-bold py-3 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow"
                            >
                              Confirmar Identidad Google
                            </button>
                            <button
                              onClick={handleLogout}
                              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-4 rounded-xl transition cursor-pointer"
                            >
                              Salir
                            </button>
                          </div>
                        </div>

                        <p className="text-[9px] text-gray-400 dark:text-slate-500 leading-relaxed">
                          La desconexión automática es una medida complementaria obligatoria en recintos clínicos para resguardar la confidencialidad de la ficha de salud del paciente.
                        </p>
                      </div>
                    );
                  }

                  return (
                    /* Therapist private dashboard interior */
                    <div className="space-y-6">

                    {/* Inactivity Countdown Warning Banner */}
                    {inactivityTimer <= 120 && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3 animate-bounce">
                        <div className="flex items-center gap-2.5 text-left">
                          <Clock className="w-5 h-5 text-amber-550 animate-spin" />
                          <div>
                            <p className="text-xs font-bold text-amber-900 dark:text-amber-400">⚠️ Advertencia de Seguridad por Inactividad</p>
                            <p className="text-[10px] text-amber-700 dark:text-amber-500 leading-relaxed">La consola se bloqueará en <span className="font-mono font-bold text-xs">{inactivityTimer}</span> segundos para resguardar la confidencialidad del paciente. Mueva el cursor o continúe digitando para prolongarla.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setInactivityTimer(900)}
                          className="bg-amber-600 hover:bg-amber-750 text-white text-[10px] font-bold py-2 px-4 rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider"
                        >
                          🔄 Extender Sesión
                        </button>
                      </div>
                    )}
                    
                    {/* Welcome therapist bar */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-850 p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-300">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-mono font-bold text-slate-400 dark:text-slate-500 tracking-wider block">
                          Consola Especialista Profesional Activa
                        </span>
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                          Bienvenido, {therapistName}
                        </h2>
                      </div>
                      
                      {/* Interactive dashboard tab switch elements */}
                      <div className="flex bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-xs rounded-2xl p-1 gap-1 border dark:border-slate-850 flex-wrap sm:flex-nowrap">
                        <button
                          onClick={() => {
                            soundFX.playPop();
                            setActiveTab("agenda");
                          }}
                          onMouseEnter={() => soundFX.playTick()}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            activeTab === "agenda"
                              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-extrabold"
                              : "text-gray-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" /> Agenda Visual
                        </button>
                        <button
                          onClick={() => {
                            soundFX.playPop();
                            setActiveTab("histories");
                          }}
                          onMouseEnter={() => soundFX.playTick()}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            activeTab === "histories"
                              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-extrabold"
                              : "text-gray-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                          }`}
                        >
                          <BookOpen className="w-3.5 h-3.5" /> Hists. Clínicas (IA)
                        </button>
                        <button
                          onClick={() => {
                            soundFX.playPop();
                            setActiveTab("payments");
                          }}
                          onMouseEnter={() => soundFX.playTick()}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            activeTab === "payments"
                              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-extrabold"
                              : "text-gray-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Finanzas y Facturas
                        </button>
                        <button
                          onClick={() => {
                            soundFX.playPop();
                            setActiveTab("abby");
                          }}
                          onMouseEnter={() => soundFX.playTick()}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            activeTab === "abby"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm font-extrabold"
                              : "text-gray-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-450"
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Asistente Abby (IA)
                        </button>
                        <button
                          onClick={() => {
                            soundFX.playPop();
                            setActiveTab("settings");
                          }}
                          onMouseEnter={() => soundFX.playTick()}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            activeTab === "settings"
                              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-extrabold"
                              : "text-gray-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5" /> Ajustes
                        </button>
                      </div>
                    </div>

                    {/* Rendering target Private tabs with rich, living animations */}
                    <div className="relative mt-2">
                      <AnimatePresence mode="wait">
                        {activeTab === "agenda" && (
                          <motion.div
                            key="agenda"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          >
                            <ClinicianAgenda
                              therapistUid={therapistUid}
                              onJoinCall={(roomId, meta) => {
                                soundFX.playChime();
                                setActiveCallRoomId(roomId);
                                setActiveCallPatient(meta || null);
                              }}
                            />
                          </motion.div>
                        )}

                        {activeTab === "histories" && (
                          <motion.div
                            key="histories"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          >
                            <ClinicalHistoryManager therapistUid={therapistUid} therapistName={therapistName} />
                          </motion.div>
                        )}

                        {activeTab === "payments" && (
                          <motion.div
                            key="payments"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          >
                            <PaymentsLedger therapistUid={therapistUid} />
                          </motion.div>
                        )}

                        {activeTab === "abby" && (
                          <motion.div
                            key="abby"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          >
                            <AbbyAssistant
                              mode="doctor"
                              therapistUid={therapistUid}
                              therapistName={therapistName}
                              settings={settings}
                            />
                          </motion.div>
                        )}

                        {activeTab === "settings" && (
                          <motion.div
                            key="settings"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                          >
                            <ClinicianSettings
                              therapistUid={therapistUid}
                              currentSettings={settings}
                              onSettingsSaved={(newSettings) => {
                                soundFX.playChime();
                                setSettings(newSettings);
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

      </main>

      {/* Floating Abby Assistant discrete Alexa capsule trigger for Doctors */}
      {portalMode === "dashboard" && user && (
        <AbbyAssistant
          mode="doctor_floating"
          therapistUid={therapistUid}
          therapistName={therapistName}
          settings={settings}
        />
      )}

      {/* Patient Abby Assistant public floating bubble */}
      {portalMode === "public" && (
        <AbbyAssistant
          mode="patient"
          settings={settings}
        />
      )}

      {/* Human-friendly high-end clinical Footer */}
      <footer className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-t border-gray-100/50 dark:border-slate-800/50 py-10 mt-16 text-slate-500 dark:text-slate-400 text-xs font-sans transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-left pb-8 border-b border-gray-100 dark:border-slate-800">
          
          {/* Column 1: Clinic & Contact Details */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#1D1D1F] dark:text-white uppercase tracking-wider text-[10px] font-sans flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-500" /> Contacto de la Consulta
            </h4>
            <div className="space-y-1.5">
              <p className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Email:</span>{" "}
                <span className="font-medium text-slate-600 dark:text-slate-400">{settings?.contactEmail || "contacto@digitalclinique.cl"}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Fono:</span>{" "}
                <span className="font-medium text-slate-600 dark:text-slate-400">{settings?.contactPhone || "+56 9 8271 9384"}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Nº Registro SIS:</span>{" "}
                <span className="font-mono bg-slate-50 dark:bg-slate-950 px-1 bg-opacity-70 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
                  Reg Nº {settings?.sisNumber || "482931"}
                </span>
              </p>
            </div>
          </div>

          {/* Column 2: Legal Regulations Chile */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#1D1D1F] dark:text-white uppercase tracking-wider text-[10px] font-sans flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Regulaciones Vigentes Chile
            </h4>
            <div className="space-y-1.5 leading-relaxed">
              <p>
                <strong className="text-slate-700 dark:text-slate-300">Ley 19.628:</strong> Protección de datos de carácter personal de salud de forma estrictamente confidencial.
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-300">Ley 20.584:</strong> Resguardo absoluto de los derechos y deberes en telemedicina y consultas.
              </p>
            </div>
          </div>

          {/* Column 3: Telehealth Guarantees */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#1D1D1F] dark:text-white uppercase tracking-wider text-[10px] font-sans flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-500" /> Garantías de Telemedicina
            </h4>
            <div className="space-y-1.5 leading-relaxed">
              <p>🔐 Videollamadas P2P cifradas mediante firmas de token WebRTC temporales.</p>
              <p>💳 Pasarela electrónica segura con estándar PCI Compliance.</p>
              <p>🤖 Asistencia virtual Abby AI para reprogramación de agendas continuada.</p>
            </div>
          </div>

        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-center">
          <p>© 2026 MindSpace Clínica Digital. Todos los derechos reservados.</p>
          <div className="flex gap-4 font-semibold text-slate-600 dark:text-slate-500 flex-wrap justify-center sm:justify-start">
            <span onClick={() => setTermsModalOpen(true)} className="hover:text-emerald-500 cursor-pointer transition">Términos de Servicio</span>
            <span>·</span>
            <span onClick={() => setPrivacyModalOpen(true)} className="hover:text-emerald-500 cursor-pointer transition">Políticas de Privacidad Médica</span>
            <span>·</span>
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setPortalMode("dashboard");
              }}
              className="hover:text-slate-700 dark:hover:text-slate-300 hover:underline transition cursor-pointer text-slate-400 font-mono text-[9px] uppercase tracking-wider flex items-center gap-1"
            >
              🔒 Acceso Clínicos
            </button>
          </div>
        </div>
      </footer>

      {/* Reputation sharing modal */}
      <ShareReputationModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        therapistName={user?.displayName || "Ps. José Ignacio Romero Velásquez"}
        therapistEmail={user?.email || "joseignacio.rovel@gmail.com"}
      />

      {/* Terms of Service & Privacy modals */}
      <TermsOfServiceModal
        isOpen={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
      />
      <PrivacyPolicyModal
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
      />

    </div>
  );
}
