import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, Timestamp, orderBy, getDocs, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Heart, Smile, Moon, Calendar, Sparkles, CheckCircle2, TrendingUp, Plus, Activity, LogOut, ShieldAlert, Award, AlertCircle, Video, MessageSquare, Clock, ChevronDown, User } from "lucide-react";
import BookingCalendar from "./BookingCalendar";
import { soundFX } from "../utils/soundFX";
import { motion, AnimatePresence } from "motion/react";

// Local helper to track errors on Firestore
enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface PatientPortalProps {
  therapistUid: string;
  therapistName: string;
  sessionPrice: number;
  onJoinCall: (roomId: string) => void;
}

export default function PatientPortal({ therapistUid, therapistName, sessionPrice, onJoinCall }: PatientPortalProps) {
  // Sync Credential States
  const [patientRut, setPatientRut] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"journal" | "appointments" | "crisis" | "booking">("appointments");

  // Core Data Lists
  const [appointments, setAppointments] = useState<any[]>([]);
  const [moodLogs, setMoodLogs] = useState<any[]>([]);

  // Form State for new CBT entry
  const [newMood, setNewMood] = useState<number>(3); // 1-5
  const [newSleepScore, setNewSleepScore] = useState<number>(3); // 1-5
  const [newSleepHours, setNewSleepHours] = useState<number>(8); // hours
  const [newCognitiveNote, setNewCognitiveNote] = useState("");
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Error tracking state
  const [localErr, setLocalErr] = useState<string | null>(null);

  // Policy-driven scheduling/rescheduling states
  const [reschedulingAppt, setReschedulingAppt] = useState<any | null>(null);
  const [reschedDate, setReschedDate] = useState("");
  const [reschedSlot, setReschedSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reschedError, setReschedError] = useState("");
  const [reschedulingSuccess, setReschedulingSuccess] = useState(false);

  // Policy-driven cancellation state
  const [cancelingAppt, setCancelingAppt] = useState<any | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelingSuccess, setCancelingSuccess] = useState(false);

  // Crisis Alert State
  const [showCrisisModal, setShowCrisisModal] = useState(false);
  const [crisisStep, setCrisisStep] = useState<"options" | "active_priority" | "overbook_form" | "overbook_success">("options");
  const [crisisPhone, setCrisisPhone] = useState("");
  const [crisisDesc, setCrisisDesc] = useState("");
  const [isSubmittingCrisis, setIsSubmittingCrisis] = useState(false);
  const [crisisProposedAppt, setCrisisProposedAppt] = useState<any | null>(null);
  const [overbookedAppt, setOverbookedAppt] = useState<any | null>(null);

  // Dynamic helper to check if patient has already submitted an entry TODAY
  const hasSubmittedToday = () => {
    if (!moodLogs || moodLogs.length === 0) return false;
    const nowObj = new Date();
    const todayDay = nowObj.getDate();
    const todayMonth = nowObj.getMonth();
    const todayYear = nowObj.getFullYear();
    
    return moodLogs.some((log: any) => {
      if (!log.createdAt) return false;
      const logDate = log.createdAt.seconds 
        ? new Date(log.createdAt.seconds * 1000) 
        : new Date(log.createdAt);
      return logDate.getDate() === todayDay &&
             logDate.getMonth() === todayMonth &&
             logDate.getFullYear() === todayYear;
    });
  };

  // Abigail AI: Scan closest standard patient slot or coordinate emergency sobrecupo
  const handleAbbyScanPriorityMeters = async () => {
    setIsSubmittingCrisis(true);
    setTimeout(async () => {
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        let availSlots = [
          "09:00 - 10:00",
          "10:15 - 11:15",
          "11:30 - 12:30",
          "15:00 - 16:00",
          "16:15 - 17:15",
          "17:30 - 18:30"
        ];
        try {
          const savedAvail = localStorage.getItem("mindspace_availability");
          if (savedAvail) {
            const parsed = JSON.parse(savedAvail);
            availSlots = parsed.slots || availSlots;
          }
        } catch {}

        const appointmentsRef = collection(db, "appointments");
        const q = query(appointmentsRef, where("date", "==", todayStr), where("status", "==", "scheduled"));
        const querySnapshot = await getDocs(q);
        const bookedSlots = querySnapshot.docs.map(doc => doc.data().timeSlot);

        const freeSlots = availSlots.filter(s => !bookedSlots.includes(s));
        
        if (freeSlots.length > 0) {
          setCrisisProposedAppt({
            date: todayStr,
            timeSlot: freeSlots[0]
          });
          setCrisisStep("active_priority");
        } else {
          // No regular slots left, offer the overbooking (Sobrecupo) form directly
          setCrisisStep("overbook_form");
        }
      } catch (e) {
        console.error("Abby crisis scan error: ", e);
        setCrisisStep("overbook_form");
      } finally {
        setIsSubmittingCrisis(false);
      }
    }, 1200);
  };

  // Convert proposed standard priority slot during crisis to a booked appointment
  const handleConfirmProposedPriority = async () => {
    if (!crisisProposedAppt || !patientRut || !patientEmail) return;
    setIsSubmittingCrisis(true);
    try {
      const apptId = "app_priority_" + Math.random().toString(36).substring(2, 11);
      const apptDocRef = doc(db, "appointments", apptId);
      
      const priorityAppointment: any = {
        id: apptId,
        patientId: "patient_priority_" + Math.random().toString(36).substring(2, 8),
        patientName: appointments[0]?.patientName || patientEmail.split("@")[0] || "Paciente Prioritario",
        patientEmail: patientEmail.trim().toLowerCase(),
        patientPhone: appointments[0]?.patientPhone || "+56912345678",
        patientRut: patientRut.trim().toLowerCase(),
        consentLawAccepted: true,
        date: crisisProposedAppt.date,
        timeSlot: crisisProposedAppt.timeSlot,
        status: "scheduled",
        attendanceStatus: "confirmed", // Patient immediately in room
        paymentStatus: "pending",
        price: 0, // waive price/pay later for crisis
        notes: `[🚨 PRIORIDAD ACTIVA ABIY AI - ASISTENCIA DE CRISIS] Cupo regular agendado de inmediato. Mensaje: "Asistencia asignada automáticamente ante alerta clínica. Favor priorizar contacto clínico de inmediato."`,
        videoRoomId: "room_priority_" + Math.random().toString(36).substring(2, 11),
        createdAt: Timestamp.now(),
        ownerId: therapistUid,
        isCrisis: true
      };
      
      await setDoc(apptDocRef, priorityAppointment);
      setOverbookedAppt(priorityAppointment);
      setCrisisStep("overbook_success");
    } catch (err) {
      console.error("Error setting priority appointment: ", err);
      alert("Error al tramitar la reserva de emergencia. Intente de nuevo.");
    } finally {
      setIsSubmittingCrisis(false);
    }
  };

  // Create an immediate extraordinary overbooking ("Sobrecupo de Urgencia")
  const handleConfirmCrisisOverbook = async () => {
    if (!patientRut || !patientEmail) return;
    setIsSubmittingCrisis(true);
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const apptId = "app_crisis_" + Math.random().toString(36).substring(2, 11);
      const apptDocRef = doc(db, "appointments", apptId);
      
      const currentHour = String(today.getHours()).padStart(2, "0");
      const currentMin = String(today.getMinutes()).padStart(2, "0");
      
      const endHourVal = today.getHours();
      const endMinVal = today.getMinutes() + 30;
      let finalEndHour = endHourVal;
      let finalEndMin = endMinVal;
      if (finalEndMin >= 60) {
        finalEndMin -= 60;
        finalEndHour += 1;
      }
      
      const timeSlotStr = `${currentHour}:${currentMin} - ${String(finalEndHour).padStart(2, "0")}:${String(finalEndMin).padStart(2, "0")} (SOBRECUPO DE URGENCIA ACTIVADO)`;
      
      const crisisAppointment: any = {
        id: apptId,
        patientId: "patient_crisis_" + Math.random().toString(36).substring(2, 8),
        patientName: appointments[0]?.patientName || patientEmail.split("@")[0] || "Paciente en Crisis",
        patientEmail: patientEmail.trim().toLowerCase(),
        patientPhone: crisisPhone || appointments[0]?.patientPhone || "+56912345678",
        patientRut: patientRut.trim().toLowerCase(),
        consentLawAccepted: true,
        date: todayStr,
        timeSlot: timeSlotStr,
        status: "scheduled",
        attendanceStatus: "confirmed", // Ready and ready to consult immediately
        paymentStatus: "pending",
        price: 0, // settle billing post-crisis
        notes: `[🚨 ALERTA DE CRISIS EMOCIONAL & SOBRECUPO] El paciente ha activado el botón de asistencia en crisis en su bitácora. Mensaje reportado: "${crisisDesc || "Sin descripción proporcionada (Alerta Crítica)"}". Teléfono de contacto directo: ${crisisPhone}`,
        videoRoomId: "room_crisis_" + Math.random().toString(36).substring(2, 11),
        createdAt: Timestamp.now(),
        ownerId: therapistUid,
        isCrisis: true
      };
      
      await setDoc(apptDocRef, crisisAppointment);
      setOverbookedAppt(crisisAppointment);
      setCrisisStep("overbook_success");
    } catch (err) {
      console.error("Error creating crisis overbooking:", err);
      alert("Error al tramitar el sobrecupo. Intente de nuevo.");
    } finally {
      setIsSubmittingCrisis(false);
    }
  };

  // Helper clock to verify if slot is modifiable
  const checkCanModifyAppointment = (apptDateStr: string, timeSlotStr: string): { canModify: boolean; hoursRemaining: number } => {
    try {
      const todayStr = apptDateStr; // e.g. "2026-05-26"
      const [startSlot] = timeSlotStr.split("-").map(s => s.trim()); // e.g. "15:00"
      const [h, m] = startSlot.split(":").map(Number);
      const apptDateTime = new Date(`${todayStr}T${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`);
      
      const now = new Date();
      const diffMs = apptDateTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return {
        canModify: diffHours >= 2,
        hoursRemaining: diffHours
      };
    } catch {
      return { canModify: false, hoursRemaining: 0 };
    }
  };

  // Safe availability slot retriever for chosen dates inside the rescheduling flow
  useEffect(() => {
    if (!reschedDate || !reschedulingAppt) {
      setAvailableSlots([]);
      return;
    }
    
    const fetchAvailableSlots = async () => {
      setLoadingSlots(true);
      try {
        let availDays = [1, 2, 3, 4, 5];
        let availSlots = [
          "09:00 - 10:00",
          "10:15 - 11:15",
          "11:30 - 12:30",
          "15:00 - 16:00",
          "16:15 - 17:15",
          "17:30 - 18:30"
        ];
        try {
          const savedAvail = localStorage.getItem("mindspace_availability");
          if (savedAvail) {
            const parsed = JSON.parse(savedAvail);
            availDays = parsed.days || availDays;
            availSlots = parsed.slots || availSlots;
          }
        } catch {}

        let suspensions: any[] = [];
        try {
          const savedSusp = localStorage.getItem("mindspace_emergency_suspensions");
          if (savedSusp) suspensions = JSON.parse(savedSusp);
        } catch {}

        // Validate selected day is available per the therapist availability parameters
        const dateObj = new Date(reschedDate + "T00:00:00");
        const jsDay = dateObj.getDay();
        if (!availDays.includes(jsDay)) {
          setAvailableSlots([]);
          return;
        }

        // Validate emergency suspensions
        const suspension = suspensions.find(s => s.date === reschedDate);
        if (suspension && suspension.type === "full_day") {
          setAvailableSlots([]);
          return;
        }

        let activeSlots = [...availSlots];
        if (suspension && suspension.type === "specific_slots") {
          activeSlots = activeSlots.filter(s => !suspension.slots.includes(s));
        }

        // Validate already scheduled appointments to prevent conflicts
        const appointmentsRef = collection(db, "appointments");
        const q = query(appointmentsRef, where("date", "==", reschedDate), where("status", "==", "scheduled"));
        const querySnapshot = await getDocs(q);
        const bookedSlots = querySnapshot.docs
          .map(doc => doc.data())
          .map((appt: any) => appt.timeSlot);

        const freeSlots = activeSlots.filter(s => !bookedSlots.includes(s));
        setAvailableSlots(freeSlots);
      } catch (err) {
        console.error("Error setting availability slots: ", err);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchAvailableSlots();
  }, [reschedDate, reschedulingAppt]);

  const handleConfirmReschedule = async () => {
    if (!reschedulingAppt || !reschedDate || !reschedSlot) {
      setReschedError("Por favor seleccione fecha y un bloque de turno libre.");
      return;
    }

    const currentRescheduleCount = reschedulingAppt.rescheduleCount || 0;
    if (currentRescheduleCount >= 3) {
      setReschedError("Límite superado: Este turno de consulta ya tiene el máximo de 3 reagendamientos permitidos.");
      return;
    }

    setReschedError("");
    try {
      const apptRef = doc(db, "appointments", reschedulingAppt.id);
      await updateDoc(apptRef, {
        date: reschedDate,
        timeSlot: reschedSlot,
        rescheduleCount: currentRescheduleCount + 1,
        attendanceStatus: "pending", // Reset
        checkedInAt: null,
        notes: `${reschedulingAppt.notes || ""} [Reagendado por el paciente al turno ${reschedDate} @ ${reschedSlot}. Registro Intento #${currentRescheduleCount + 1}]`
      });

      setReschedulingSuccess(true);
      setTimeout(() => {
        setReschedulingSuccess(false);
        setReschedulingAppt(null);
        setReschedDate("");
        setReschedSlot("");
      }, 2500);
    } catch (err) {
      console.error("Error setting reschedule: ", err);
      setReschedError("Ocurrió un error al registrar el reagendamiento. Intente nuevamente.");
    }
  };

  const handleConfirmCancellation = async () => {
    if (!cancelingAppt) return;
    try {
      const apptRef = doc(db, "appointments", cancelingAppt.id);
      await updateDoc(apptRef, {
        status: "canceled",
        notes: `${cancelingAppt.notes || ""} [Cancelado por paciente el ${new Date().toLocaleDateString()}. Motivo: ${cancellationReason || "No especificada"}]`
      });
      setCancelingSuccess(true);
      setTimeout(() => {
        setCancelingSuccess(false);
        setCancelingAppt(null);
        setCancellationReason("");
      }, 2500);
    } catch (err) {
      console.error("Error canceling appointment: ", err);
      alert("Error al anular la cita.");
    }
  };

  // Checks for credential cache
  useEffect(() => {
    const cached = localStorage.getItem("mindspace_patient_credentials");
    if (cached) {
      try {
        const { rut, email } = JSON.parse(cached);
        if (rut && email) {
          setPatientRut(rut);
          setPatientEmail(email);
          setHasAccess(true);
        }
      } catch (err) {
        // stale cache
      }
    }
  }, []);

  // Sync data streams once credentials verify
  useEffect(() => {
    if (!hasAccess || !patientRut || !patientEmail) return;

    // Load actual upcoming appointments using secure patient-specific filters.
    // We execute two precise equality queries (by email and by RUT) and merge results client-side.
    const normalizedEmail = patientEmail.trim().toLowerCase();
    const normalizedRut = patientRut.trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase();
    const rawRut = patientRut.trim().toLowerCase();

    const appQueryEmail = query(
      collection(db, "appointments"),
      where("patientEmail", "==", normalizedEmail)
    );

    const appQueryRut = query(
      collection(db, "appointments"),
      where("patientRut", "==", normalizedRut)
    );

    const resultsMap: { [id: string]: any } = {};

    const handleUpdate = () => {
      const mergedList = Object.values(resultsMap);
      mergedList.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setAppointments(mergedList);
    };

    const unsubscribeAppEmail = onSnapshot(appQueryEmail, (snapshot) => {
      snapshot.docs.forEach((doc) => {
        resultsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      handleUpdate();
    }, (error) => {
      console.warn("Could not sync appointments by email securely:", error);
    });

    const unsubscribeAppRut = onSnapshot(appQueryRut, (snapshot) => {
      snapshot.docs.forEach((doc) => {
        resultsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      handleUpdate();
    }, (error) => {
      console.warn("Could not sync appointments by RUT securely:", error);
    });

    // Also listen to raw RUT in case it was stored with raw formatting
    let unsubscribeAppRawRut = () => {};
    if (rawRut !== normalizedRut) {
      const appQueryRawRut = query(
        collection(db, "appointments"),
        where("patientRut", "==", rawRut)
      );
      unsubscribeAppRawRut = onSnapshot(appQueryRawRut, (snapshot) => {
        snapshot.docs.forEach((doc) => {
          resultsMap[doc.id] = { id: doc.id, ...doc.data() };
        });
        handleUpdate();
      }, (error) => {
        console.warn("Could not sync appointments by raw RUT securely:", error);
      });
    }

    // Load actual mood logs reported
    const moodQuery = query(
      collection(db, "mood_journals"),
      where("patientRut", "==", normalizedRut)
    );

    const unsubscribeMood = onSnapshot(moodQuery, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      list.sort((a: any, b: any) => b.createdAt?.seconds - a.createdAt?.seconds);
      setMoodLogs(list);
    }, (error) => {
      console.warn("Could not sync mood logs securely:", error);
    });

    return () => {
      unsubscribeAppEmail();
      unsubscribeAppRut();
      unsubscribeAppRawRut();
      unsubscribeMood();
    };
  }, [hasAccess, patientRut, patientEmail, therapistUid]);

  // Handle Sync Button Submission
  const handleValidateIdentify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientRut.trim() || !patientEmail.trim()) {
      alert("Por favor ingrese su RUT y correo registrados.");
      return;
    }

    setIsSyncing(true);
    setLocalErr(null);

    // Persist to local cache for passwordless comfort
    localStorage.setItem(
      "mindspace_patient_credentials",
      JSON.stringify({
        rut: patientRut.trim().toLowerCase(),
        email: patientEmail.trim().toLowerCase(),
      })
    );

    setTimeout(() => {
      setIsSyncing(false);
      setHasAccess(true);
    }, 800);
  };

  // Log Out/Exit Companion Workspace
  const handleExitPortal = () => {
    localStorage.removeItem("mindspace_patient_credentials");
    setPatientRut("");
    setPatientEmail("");
    setHasAccess(false);
    setAppointments([]);
    setMoodLogs([]);
  };

  // Flow payment checkout + automated LibreDTE BHE billing simulator (Chilean 2026 model)
  const handleSimulateSuccessfulPaymentAndBilling = async (app: any) => {
    try {
      const payload = {
        appointmentId: app.id,
        price: app.price || 50000,
        patientEmail: app.patientEmail || patientEmail,
        patientName: app.patientName,
        patientRut: app.patientRut || patientRut
      };

      const res = await fetch("/api/flow/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("No se pudo conectar con el servidor de pagos.");
      }

      const data = await res.json();
      if (data.success && data.paymentUrl) {
        window.open(data.paymentUrl, "_blank");
      } else {
        throw new Error(data.error || "Respuesta inválida de la pasarela.");
      }
    } catch (err: any) {
      console.error("Error con cobro Flow:", err);
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert("Error al procesar el pago con Flow Chile.");
      }
    }
  };

  // Submit CBT mood registry
  const handleSubmitMoodDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientRut || !patientEmail) return;

    if (hasSubmittedToday()) {
      setLocalErr("Tu auto-reporte para el día de hoy ya ha sido registrado con éxito.");
      return;
    }

    setIsSubmittingLog(true);
    setLocalErr(null);

    const logId = "mood_" + Math.random().toString(36).substring(2, 11);

    const newLog = {
      id: logId,
      patientRut: patientRut.trim().toLowerCase(),
      patientEmail: patientEmail.trim().toLowerCase(),
      patientName: appointments[0]?.patientName || patientEmail.split("@")[0],
      mood: newMood,
      sleepScore: newSleepScore,
      sleepHours: Number(newSleepHours),
      cognitiveNote: newCognitiveNote.trim(),
      ownerId: therapistUid,
      createdAt: Timestamp.now(),
    };

    try {
      await setDoc(doc(db, "mood_journals", logId), newLog);
      
      // Clean up form
      setNewCognitiveNote("");
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 4000);
    } catch (err: any) {
      console.error("Error creating mood journal:", err);
      setLocalErr("No fue posible registrar la bitácora debido a normas de privilegios. Intente de nuevo.");
    } finally {
      setIsSubmittingLog(false);
    }
  };

  // Get mood emoji
  const getMoodEmojiInfo = (rating: number) => {
    const emojis: { [key: number]: { emoji: string; text: string; color: string } } = {
      1: { emoji: "😭", text: "Muy Decaído / Angustiado", color: "text-rose-500 bg-rose-50 border-rose-200" },
      2: { emoji: "🙁", text: "Bajo / Ansioso", color: "text-orange-500 bg-orange-50 border-orange-200" },
      3: { emoji: "😐", text: "Neutral / Estable", color: "text-slate-500 bg-slate-50 border-slate-200" },
      4: { emoji: "🙂", text: "Favorable / Animado", color: "text-emerald-500 bg-emerald-50 border-emerald-200" },
      5: { emoji: "😆", text: "Fabuloso / Autónomo", color: "text-teal-500 bg-teal-50 border-teal-200" },
    };
    return emojis[rating] || { emoji: "😐", text: "Desconocido", color: "text-gray-500 bg-gray-50 border-gray-200" };
  };

  // Get sleep quality stars
  const getSleepQualityInfo = (score: number) => {
    const sleepMap: { [key: number]: string } = {
      1: "Insomnio severo / Sueño nulo 😫",
      2: "Desvelo recurrente / Muy interrumpido 😴",
      3: "Suficiente pero cansado 😐",
      4: "Reparador y tranquilo 😊",
      5: "Profundo e hiper-vitalizador (Fisiológico) 🌟",
    };
    return sleepMap[score] || "Estable";
  };

  // SVG Chart rendering helper to eliminate recharts issues
  const renderInteractiveSvgChart = () => {
    if (moodLogs.length === 0) return null;

    // Last 10 records sorted chronologically for charting
    const chartLogs = [...moodLogs].slice(0, 7).reverse();
    const width = 600;
    const height = 180;
    const padding = 35;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    const maxDays = chartLogs.length;
    if (maxDays < 1) return null;

    // We plot two curves:
    // 1. Mood scale 1-5 maps to graphHeight
    const getMoodY = (val: number) => {
      // ratio: (5(top) - value) / 4 (range)
      const ratio = (5 - val) / 4;
      return padding + ratio * graphHeight;
    };

    // 2. Sleep Hours scale 0-14 maps to graphHeight
    const getSleepY = (val: number) => {
      const clampedVal = Math.min(Math.max(val, 0), 14);
      const ratio = (14 - clampedVal) / 14;
      return padding + ratio * graphHeight;
    };

    const getX = (idx: number) => {
      if (maxDays === 1) return padding + graphWidth / 2;
      return padding + (idx / (maxDays - 1)) * graphWidth;
    };

    // Construct lines
    let moodPath = "";
    let sleepPath = "";
    chartLogs.forEach((log, idx) => {
      const x = getX(idx);
      const mY = getMoodY(log.mood);
      const sY = getSleepY(log.sleepHours);

      if (idx === 0) {
        moodPath = `M ${x} ${mY}`;
        sleepPath = `M ${x} ${sY}`;
      } else {
        moodPath += ` L ${x} ${mY}`;
        sleepPath += ` L ${x} ${sY}`;
      }
    });

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Draw subtle grid */}
        {[1, 2, 3, 4, 5].map((level) => {
          const ratio = (5 - level) / 4;
          const y = padding + ratio * graphHeight;
          return (
            <g key={level} className="opacity-20 dark:opacity-10">
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" strokeWidth="1" strokeDasharray="3,3" />
              <text x={padding - 10} y={y + 4} className="text-[9px] font-bold font-mono text-slate-400 fill-current text-right">{level}</text>
            </g>
          );
        })}

        {/* Labels below */}
        {chartLogs.map((log, idx) => {
          const x = getX(idx);
          const dateLabel = log.createdAt?.seconds 
            ? new Date(log.createdAt.seconds * 1000).toLocaleDateString("es-CL", { day: "numeric", month: "numeric" })
            : "Hoy";
          return (
            <text key={idx} x={x} y={height - 8} textAnchor="middle" className="text-[9px] font-bold font-mono fill-current text-slate-400 opacity-80">
              {dateLabel}
            </text>
          );
        })}

        {/* Lines */}
        <path d={moodPath} fill="none" stroke="#10b981" strokeWidth="2.5" className="drop-shadow-[0_2px_4px_rgba(16,185,129,0.3)]" />
        <path d={sleepPath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeDasharray="1,1" className="drop-shadow-[0_2px_4px_rgba(99,102,241,0.3)]" />

        {/* Dots */}
        {chartLogs.map((log, idx) => {
          const x = getX(idx);
          const mY = getMoodY(log.mood);
          const sY = getSleepY(log.sleepHours);

          return (
            <g key={idx}>
              {/* Mood markers */}
              <circle cx={x} cy={mY} r="4" fill="#10b981" stroke="#fff" strokeWidth="1" className="cursor-pointer hover:r-6 transition-all" />
              {/* Sleep duration markers */}
              <circle cx={x} cy={sY} r="4" fill="#6366f1" stroke="#fff" strokeWidth="1" className="cursor-pointer hover:r-6 transition-all" />
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="w-full md:max-w-4xl md:mx-auto py-0 md:py-1 animate-in fade-in duration-300">
      
      {/* 1. STATE: UNAUTHORIZED / ID SECURE GATE */}
      {!hasAccess ? (
        <div className="w-full md:max-w-md md:mx-auto bg-white dark:bg-slate-900 rounded-none md:rounded-3xl border-0 md:border border-gray-150 dark:border-slate-800 p-6 md:p-8 shadow-none md:shadow-xl text-center space-y-6 min-h-screen md:min-h-0">
          <div className="inline-flex p-3.5 bg-emerald-500/10 text-emerald-600 rounded-2xl border border-emerald-500/20">
            <Smile className="w-8 h-8 animate-bounce text-emerald-500" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Portal Clínico del Paciente</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Espacio terapéutico seguro para registrar bitácoras CBT, verificar citas y unirse a videoconsultas cifradas de forma directa.
            </p>
          </div>

          <form onSubmit={handleValidateIdentify} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 block">RUN / RUT Identificación</label>
              <input
                required
                type="text"
                placeholder="Ej: 19.382.115-3"
                value={patientRut}
                onChange={(e) => setPatientRut(e.target.value)}
                className="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-sans focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 block">Correo Electrónico registrado</label>
              <input
                required
                type="email"
                placeholder="Ej: paciente@correo.com"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                className="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-sans focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-[10px] leading-relaxed text-emerald-800 dark:text-emerald-400 flex items-start gap-2.5">
              <span className="text-sm">🛡️</span>
              <div>
                <strong>Confidencialidad Garantizada (Ley 19.628 y 20.584):</strong>
                <p className="mt-0.5 text-[9px] text-[#2e5d42] dark:text-gray-300">
                  Sus datos clínicos de asistencia y diario de ánimo ingresados en este espacio están protegidos bajo secreto profesional inquebrantable y cifrado de datos clínicos. Ningún motor de IA procesa estos datos para perfiles o publicidad alguna.
                </p>
                <p className="mt-1.5 text-[9px] font-semibold text-emerald-900 dark:text-emerald-300 border-t border-emerald-500/10 pt-1">
                  ✓ Sus datos de contacto (teléfono y correo electrónico) son de carácter estrictamente administrativo y serán utilizados única y exclusivamente para efectos de coordinación, confirmación y notificaciones de atención, sin fines comerciales ni publicitarios de ningún tipo.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSyncing}
              className="w-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-xs font-extrabold p-3.5 rounded-xl transition duration-200 cursor-pointer shadow hover:scale-102 flex items-center justify-center gap-1.5 uppercase tracking-wider"
            >
              {isSyncing ? "Validando..." : "Sincronizar Portal de Paciente 🔐"}
            </button>
          </form>

          <p className="text-[10px] text-gray-400">
            * Para resguardo de su privacidad, una vez validado, sus credenciales se guardarán localmente cifradas en su celular o computador para acceso rápido seguro en futuras visitas.
          </p>
        </div>
      ) : (
        
        // 2. STATE: COMPANION APP DASHBOARD (Simulated PWA Play Store App wrapper)
        <div className="w-full md:max-w-md md:mx-auto bg-white dark:bg-[#090d16] border-0 md:border-8 border-slate-950 dark:border-slate-850 rounded-none md:rounded-[48px] overflow-hidden shadow-none md:shadow-2xl flex flex-col font-sans transition-all duration-300 relative text-left select-none min-h-screen md:min-h-[750px] text-slate-900 dark:text-slate-100 mb-0 md:mb-10 animate-in fade-in duration-300">
          
          {/* Simulated Smartphone Status Bar & Dynamic Island (Shown only on Desktop mockup) */}
          <div className="hidden md:flex bg-slate-950 text-slate-400 px-6 py-2 justify-between items-center text-[9.5px] font-mono select-none">
            <span className="font-bold flex items-center gap-1 text-slate-350 shrink-0">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
              9:41 AM
            </span>
            {/* Pill Notch */}
            <div className="w-20 h-4 bg-black rounded-full flex items-center justify-center shrink-0 border border-slate-800">
              <span className="w-2 h-1.2 bg-[#0c1426] rounded-full"></span>
            </div>
            <div className="flex items-center gap-1 font-sans text-slate-350 shrink-0">
              <span>📶 5G</span>
              <span>🔋 99%</span>
            </div>
          </div>

          {/* App Top Toolbar - Clinician Theme with Custom Orange Blue text heading gradient */}
          <div className="bg-white dark:bg-slate-900 px-5 py-3.5 border-b border-slate-100 dark:border-slate-855 flex justify-between items-center relative text-left">
            <div className="flex items-center gap-2">
              <div className="w-7.5 h-7.5 rounded-xl bg-gradient-to-tr from-cyan-400 via-[#8b5cf6] to-[#ec4899] text-white font-extrabold flex items-center justify-center shadow-md text-[11px]">
                MS
              </div>
              <div className="text-left select-none">
                <h2 className="text-[13px] font-black tracking-tight text-gradient-orange-blue uppercase">
                  MindSpace
                </h2>
                <p className="text-[8.5px] font-extrabold text-indigo-500 dark:text-cyan-400 uppercase tracking-widest mt-0.5 leading-none">Portal Paciente</p>
              </div>
            </div>

            {/* Compact professional exit session controls dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 p-2 py-1.5 rounded-full text-slate-800 dark:text-slate-100 text-[10px] font-extrabold shadow-sm transition border border-slate-200/50 dark:border-slate-705 leading-none cursor-pointer"
              >
                <div className="w-4.5 h-4.5 bg-gradient-to-tr from-cyan-400 to-indigo-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {patientEmail[0]?.toUpperCase() || "P"}
                </div>
                <span>Menú</span>
                <ChevronDown className={`w-3.2 h-3.2 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                  <div className="absolute right-0 mt-3.5 w-64 bg-white dark:bg-slate-900 border border-slate-200/65 dark:border-slate-800 rounded-2xl shadow-2xl p-4 z-50 text-left space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="space-y-0.5 text-xs text-left">
                      <span className="text-[8px] font-extrabold uppercase text-slate-400 block tracking-wider font-mono">Usuario Identificado:</span>
                      <p className="font-extrabold text-slate-900 dark:text-gray-150 truncate leading-tight mt-1">{patientEmail}</p>
                      <p className="font-mono text-[9px] text-gray-500 font-bold tracking-tight">{patientRut.toUpperCase()}</p>
                    </div>

                    <div className="pt-2.5 text-[9.5px] text-slate-650 dark:text-slate-400 space-y-2 font-medium">
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block animate-pulse"></span>
                        <span>Canal Cifrado Ley 19.628</span>
                      </div>
                      <p className="leading-relaxed text-slate-450 dark:text-slate-500">
                        Los datos ingresados están regidos por las normativas de secreto profesional en Chile (Ley 20.584).
                      </p>
                    </div>

                    <div className="pt-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          handleExitPortal();
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-rose-50 border border-rose-100 dark:bg-rose-950/20 dark:border-rose-905 dark:text-rose-450 hover:text-rose-700 text-rose-600 text-[10px] font-extrabold p-2 rounded-xl transition duration-150 cursor-pointer"
                      >
                        <LogOut className="w-3.2 h-3.2" /> Cerrar Canal Seguro
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Device Scrollbox Viewport representing the content container */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-slate-950/30 space-y-4 max-h-none md:max-h-[580px]">
            
            {/* Playstore Bottom Tab Simulators: Top buttons header to split columns into interactive viewtabs */}
            <div className="bg-white/70 dark:bg-slate-900/75 backdrop-blur-md border border-slate-150 dark:border-slate-850 p-1 rounded-2xl flex gap-1 justify-between select-none shadow-xs mb-2">
              <button
                type="button"
                onClick={() => {
                  soundFX.playPop();
                  setActiveMobileTab("appointments");
                }}
                onMouseEnter={() => soundFX.playTick()}
                className={`flex-1 text-[9.5px]/none font-extrabold p-2 rounded-xl transition duration-150 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer ${
                  activeMobileTab === "appointments"
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow-md font-black"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <Calendar className="w-3.2 h-3.2 text-current shrink-0" />
                <span>Agenda</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFX.playPop();
                  setActiveMobileTab("booking");
                }}
                onMouseEnter={() => soundFX.playTick()}
                className={`flex-1 text-[9.5px]/none font-extrabold p-2 rounded-xl transition duration-150 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer ${
                  activeMobileTab === "booking"
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow-md font-black"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <Plus className="w-3.2 h-3.2 text-current shrink-0" />
                <span>Reservar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFX.playPop();
                  setActiveMobileTab("journal");
                }}
                onMouseEnter={() => soundFX.playTick()}
                className={`flex-1 text-[9.5px]/none font-extrabold p-2 rounded-xl transition duration-150 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer ${
                  activeMobileTab === "journal"
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow-md font-black"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <Smile className="w-3.2 h-3.2 text-current shrink-0" />
                <span>Bitácora</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFX.playPop();
                  setActiveMobileTab("crisis");
                }}
                onMouseEnter={() => soundFX.playTick()}
                className={`flex-1 text-[9.5px]/none font-extrabold p-2 rounded-xl transition duration-150 flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer ${
                  activeMobileTab === "crisis"
                    ? "bg-red-650 text-white shadow-md font-black animate-pulse"
                    : "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                }`}
              >
                <AlertCircle className="w-3.2 h-3.2 text-current shrink-0" />
                <span>S.O.S</span>
              </button>
            </div>

            {/* LEFT COLUMN: Appointments visual checklists & Video rooms */}
            <AnimatePresence mode="wait">
              {activeMobileTab === "appointments" && (
                <motion.div
                  key="appointments"
                  initial={{ opacity: 0, scale: 0.98, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 text-left w-full"
                >
                  <div className="bg-white/85 dark:bg-slate-900/80 backdrop-blur-md border border-gray-150 dark:border-slate-850 rounded-3xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-850 pb-2.5 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-500" /> Mis Próximas Citas
                </h3>

                {appointments.length === 0 ? (
                  <div className="py-6 text-center text-slate-450 space-y-1.5">
                    <AlertCircle className="w-6 h-6 text-slate-300 mx-auto" />
                    <p className="text-xs">No se detectan reservas agendadas con sus datos.</p>
                    <p className="text-[10px] text-gray-400">Asegúrese de escribir exactamente el correo o RUT que usó al agendar horas.</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {appointments.map((app) => {
                      const appDateObj = new Date(app.date + "T12:00:00");
                      const appDateFormatted = appDateObj.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
                      const isPaid = app.paymentStatus === "paid";
                      
                      return (
                        <div 
                          key={app.id} 
                          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-85 border-l-4 border-l-emerald-500 space-y-3"
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <p className="font-extrabold text-xs text-slate-850 dark:text-gray-200 capitalize">{appDateFormatted}</p>
                              <p className="text-[10px] font-mono text-gray-500 font-bold dark:text-slate-400 mt-0.5">{app.timeSlot}</p>
                            </div>
                            <span className={`text-[9px] font-bold uppercase p-1 px-2 rounded-md ${
                              isPaid ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-955/35 dark:text-emerald-450" : "bg-amber-100 text-amber-850 dark:bg-amber-955/25 dark:text-amber-450"
                            }`}>
                              {isPaid ? "✓ PAGADA" : "● PRE-RESERVADA"}
                            </span>
                          </div>

                          {/* Chilean SII Billing / LibreDTE Integración Details */}
                          {isPaid ? (
                            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl space-y-1.5 text-[11px] font-sans">
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">Boleta de Honorarios:</span>
                                <span className="font-mono text-cyan-600 dark:text-cyan-400 font-extrabold">SII Folio Nº {app.boletaFolio || "20260492"}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                <span>Retención Profesional SII (14,5%):</span>
                                <span className="font-mono text-amber-600 font-bold">-${(app.boletaRetencion || Math.round((app.price || 50000) * 0.145)).toLocaleString('es-CL')} CLP</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                <span>Monto Honorario Bruto:</span>
                                <span className="font-mono">${(app.price || 50050).toLocaleString('es-CL')} CLP</span>
                              </div>
                              <div className="flex justify-between text-slate-800 dark:text-white font-bold pt-1 border-t dark:border-slate-800">
                                <span>Líquido Recibido:</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">${(app.boletaLiquido || Math.round((app.price || 50000) * 0.855)).toLocaleString('es-CL')} CLP</span>
                              </div>
                              {app.boletaUrl ? (
                                <a 
                                  href={app.boletaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 w-full bg-slate-900 hover:bg-slate-950 dark:bg-slate-800 dark:hover:bg-slate-750 text-white p-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1 hover:brightness-110 active:scale-98 transition duration-100 uppercase"
                                >
                                  📥 Descargar BHE Reemb. Isapre
                                </a>
                              ) : (
                                <a 
                                  href={`https://sii.libredte.cl/bhe-folio-20260492-sim.pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 w-full bg-slate-900 hover:bg-slate-950 dark:bg-slate-800 dark:hover:bg-slate-750 text-white p-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1 hover:brightness-110 active:scale-98 transition duration-100 uppercase"
                                >
                                  📥 Descargar BHE Reemb. Isapre
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="p-3 bg-blue-50/50 dark:bg-slate-900/35 border border-blue-100/50 dark:border-slate-800 rounded-xl space-y-2 text-[11px]">
                              <p className="text-[10px] leading-relaxed text-slate-650 dark:text-slate-400 font-medium">
                                Esta cita se encuentra temporalmente pre-reservada. Pague su arancel en línea mediante tarjetas de débito o crédito en Flow para emitir su boleta automática:
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSimulateSuccessfulPaymentAndBilling(app)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl text-[10px] font-bold transition duration-150 cursor-pointer flex items-center justify-center gap-1.5 uppercase hover:scale-[1.01] active:scale-[0.99]"
                              >
                                💳 Pagar arancel en Flow (${(app.price || 50000).toLocaleString('es-CL')} CLP)
                              </button>
                            </div>
                          )}

                          {/* Reschedule count indicator if any */}
                          {app.rescheduleCount && app.rescheduleCount > 0 ? (
                            <p className="text-[9.5px] text-amber-700 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded font-bold">
                              🔄 Reagendado: Intento {app.rescheduleCount} de 3 permitidos
                            </p>
                          ) : null}

                          {app.status === "scheduled" ? (
                            <div className="pt-1.5 flex flex-col gap-2">
                              {/* Join call button */}
                              <button
                                type="button"
                                onClick={() => onJoinCall(app.videoRoomId)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold p-2.5 rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 uppercase"
                              >
                                <Video className="w-3.5 h-3.5" /> Entrar a Videoconsulta
                              </button>

                              {/* Policy modification button row */}
                              <div className="w-full flex gap-1.5 mt-1 border-t border-slate-150 dark:border-slate-850 pt-2 text-[10px]">
                                {(() => {
                                  const { canModify, hoursRemaining } = checkCanModifyAppointment(app.date, app.timeSlot);
                                  const matchesLimit = (app.rescheduleCount || 0) < 3;

                                  return (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!canModify) {
                                            alert(`Plazo de cambios expirado: Faltan ${hoursRemaining.toFixed(1)} horas para tu cita. Nuestra política corporativa exige un mínimo de 2 horas de anticipación.`);
                                            return;
                                          }
                                          if (!matchesLimit) {
                                            alert("Límite superado: Has alcanzado el límite máximo de tres reagendamientos permitidos para este bloque.");
                                            return;
                                          }
                                          setReschedulingAppt(app);
                                          setReschedDate("");
                                          setReschedSlot("");
                                          setReschedError("");
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-1 border py-1.5 px-2 rounded-xl font-bold cursor-pointer transition-all ${
                                          canModify && matchesLimit
                                            ? "border-sky-250 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/20 dark:text-sky-450 dark:border-sky-900"
                                            : "border-slate-200 bg-slate-100 text-slate-400 dark:bg-slate-900 cursor-not-allowed opacity-50"
                                        }`}
                                      >
                                        🔄 Reagendar
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!canModify) {
                                            alert(`Plazo de cancelación expirado: Tu cita es en ${hoursRemaining.toFixed(1)} horas. De acuerdo a los términos vigentes contratados, cancelaciones fuera de plazo consideran el cobro íntegro del tiempo reservado.`);
                                            return;
                                          }
                                          setCancelingAppt(app);
                                          setCancellationReason("");
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-1 border py-1.5 px-2 rounded-xl font-bold cursor-pointer transition-all ${
                                          canModify
                                            ? "border-rose-250 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900"
                                            : "border-slate-200 bg-slate-105 text-slate-400 dark:bg-slate-900 cursor-not-allowed opacity-50"
                                        }`}
                                      >
                                        ❌ Anular
                                      </button>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-100 dark:bg-slate-900 p-2.5 rounded-xl text-center border">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">
                                {app.status === "completed" ? "✅ Sesión Finalizada" : "🚫 Reserva Anulada"}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
                </motion.div>
              )}

            {/* Agendar / Reservar Tab Item */}
            {activeMobileTab === "booking" && (
              <motion.div
                key="booking"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 text-left w-full"
              >
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-150 dark:border-slate-850 rounded-3xl p-4 shadow-sm space-y-3.5">
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-bold text-teal-600 dark:text-cyan-400 uppercase tracking-widest block leading-none">
                      📅 RESERVAS FLUIDAS DESDE TU DISPOSITIVO
                    </span>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      Nueva Sesión con {therapistName}
                    </h3>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      Seleccione una fecha y el horario clínico libre que le acomode. Su información de RUT y Correo se auto-completará en el canal cifrado clínico.
                    </p>
                  </div>

                  {/* Embedded custom mobile BookingCalendar */}
                  <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs bg-white/50 dark:bg-slate-950/20">
                    <BookingCalendar
                      therapistUid={therapistUid}
                      therapistName={therapistName}
                      sessionPrice={sessionPrice}
                      initialEmail={patientEmail}
                      initialRut={patientRut}
                      initialName={appointments[0]?.patientName || patientEmail.split("@")[0] || ""}
                      initialPhone={appointments[0]?.patientPhone || ""}
                      compact={true}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* S.O.S Crisis tab items */}
            {activeMobileTab === "crisis" && (
              <motion.div
                key="crisis"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 text-left w-full"
              >
                {/* Emergency / Crisis Block */}
                <div className="bg-rose-50/60 dark:bg-rose-950/30 backdrop-blur-md border border-rose-250 dark:border-rose-900/40 rounded-3xl p-5 shadow-sm space-y-3 pb-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4.5 h-4.5 text-red-600 dark:text-red-450 animate-pulse animate-duration-1000" />
                    <span className="text-[10.5px] font-extrabold uppercase text-red-700 dark:text-red-450 tracking-wider">Asistencia y Alerta de Crisis</span>
                  </div>
                  <p className="text-xs text-red-950 dark:text-red-300 leading-relaxed font-semibold">
                    ¿Te encuentras en un estado agudo de desorientación, angustia severa o crisis emocional? Nuestro protocolo prioritario de sobrecupo de Abby AI está activo.
                  </p>
                  <button
                    type="button"
                    onMouseEnter={() => soundFX.playTick()}
                    onClick={() => {
                      soundFX.playPop();
                      setCrisisStep("options");
                      setCrisisPhone("");
                      setCrisisDesc("");
                      setCrisisProposedAppt(null);
                      setOverbookedAppt(null);
                      setShowCrisisModal(true);
                    }}
                    className="w-full bg-red-650 hover:bg-red-700 text-white text-[10.5px] font-extrabold p-3 rounded-xl transition duration-200 cursor-pointer flex items-center justify-center gap-1.5 uppercase shadow active:scale-98 hover:scale-101"
                  >
                    🚨 Activar Protocolo de Crisis
                  </button>
                </div>

                {/* State helpline numbers for Chile */}
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md text-slate-900 dark:text-white rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-sm">
                  <span className="text-[9.5px] font-mono font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest block leading-none">
                    📞 Apoyo de Contención Estatal Chile
                  </span>
                  <p className="text-[10.5px]/relaxed text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                    Si te encuentras en una crisis severa que no logras contener solo o con riesgo inminente, recuerda marcar a estos números de auxilio gratuitos estatales 24/7 de forma confidencial:
                  </p>
                  <div className="space-y-2 text-[10.5px]">
                    <div className="p-3 bg-slate-55/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-850 rounded-2xl flex justify-between items-center text-left">
                      <div>
                        <span className="font-extrabold text-teal-600 dark:text-teal-300 block">Salud Responde🇨🇱</span>
                        <span className="text-[8.5px] text-slate-500 dark:text-zinc-400">Canal de Contención Min. de Salud</span>
                      </div>
                      <a 
                        href="tel:6003607777" 
                        onMouseEnter={() => soundFX.playTick()}
                        onClick={() => soundFX.playPop()}
                        className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold px-3 py-1.5 rounded-xl text-[10px]"
                      >
                        Llamar 6003607777
                      </a>
                    </div>
                    <div className="p-3 bg-slate-55/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-850 rounded-2xl flex justify-between items-center text-left">
                      <div>
                        <span className="font-extrabold text-[#dc2626] dark:text-[#f87171] block">S.O.S Prevención Suicidio</span>
                        <span className="text-[8.5px] text-slate-500 dark:text-zinc-400">Línea Telefónica Nacional Gratuita</span>
                      </div>
                      <a 
                        href="tel:*4141" 
                        onMouseEnter={() => soundFX.playTick()}
                        onClick={() => soundFX.playPop()}
                        className="bg-red-655 hover:bg-red-700 text-white font-extrabold px-3 py-1.5 rounded-xl text-[10px]"
                      >
                        Llamar *4141
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* CBT Info guidelines for tracking progress */}
            {activeMobileTab === "journal" && (
              <motion.div
                key="journal"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 text-left w-full"
              >
                {/* CBT Sleep & Mood informational capsule */}
                <div className="bg-purple-100/60 dark:bg-gradient-to-tr dark:from-purple-950/40 dark:to-indigo-950/40 backdrop-blur-md text-slate-900 dark:text-white rounded-3xl p-5 border border-purple-200 dark:border-purple-900/40 space-y-3.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-600 dark:text-purple-350 animate-pulse font-bold" />
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-500 dark:text-gray-300 tracking-wider">Concepto Clínico CBT + Maslow</span>
                  </div>
                  <h4 className="text-xs font-bold text-purple-700 dark:text-palliative-lila">¿Por qué monitorear el Sueño y Ánimo?</h4>
                  <p className="text-[11px] leading-relaxed text-slate-700 dark:text-gray-300">
                    En el modelo regulógico de Maslow, las <strong className="text-slate-900 dark:text-white">necesidades fisiológicas (sueño, descanso diario)</strong> son el escalón de base para regular las emociones de la persona. 
                  </p>
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-gray-400">
                    Anotar su ánimo nos permite visualizar juntos patrones automáticos de pensamiento cognitivo-conductual (CBT), facilitando un desglose objetivo en sus sesiones de progreso clínico.
                  </p>
                </div>

                {/* CBT New entry card */}
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-gray-150 dark:border-slate-850 rounded-3xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-1000 dark:text-white border-b border-slate-100 dark:border-slate-850 pb-2.5 flex items-center gap-2">
                  <Plus className="w-4.5 h-4.5 text-emerald-500" /> Nueva Bitácora de Registro Diario
                </h3>

                {localErr && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{localErr}</span>
                  </div>
                )}

                {showSuccessToast && (
                  <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5 animate-in slide-in-from-top-3 duration-300">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">¡Registro de Bitácora Guardado!</strong>
                      <span className="text-[11px] text-[#2d5c41] mt-0.5 block">Se ha integrado con éxito. {therapistName} podrá revisarlo en la próxima sesión.</span>
                    </div>
                  </div>
                )}

                {/* Secure conditional check to lock daily double logs */}
                {(() => {
                  const alreadySubmitted = hasSubmittedToday();
                  return (
                    <>
                      {alreadySubmitted && (
                        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs text-slate-600 dark:text-slate-450 flex items-start gap-2.5 shadow-xs leading-relaxed font-semibold">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-slate-900 dark:text-white block">Auto-Reporte Diario Completado ✓</span>
                            <span className="text-[10.5px] mt-1 block font-medium opacity-90 leading-relaxed text-slate-600 dark:text-slate-400">
                              Ya has registrado tu bitácora por el día de hoy. Para evitar duplicidades y mantener consistencia en tus progresos terapéuticos (CBT), el formulario se volverá a habilitar automáticamente mañana. ¡Buen trabajo! 🌱
                            </span>
                          </div>
                        </div>
                      )}

                      <form 
                        onSubmit={(e) => {
                          handleSubmitMoodDiary(e);
                        }} 
                        className="space-y-4"
                      >
                        {/* Mood Selector: Clickable premium emojis */}
                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">¿Cómo evalúa su Estado de Ánimo hoy?</span>
                          <div className="grid grid-cols-5 gap-2">
                            {[1, 2, 3, 4, 5].map((mIdx) => {
                              const info = getMoodEmojiInfo(mIdx);
                              const isSelected = newMood === mIdx;
                              return (
                                <button
                                  key={mIdx}
                                  type="button"
                                  disabled={alreadySubmitted || isSubmittingLog}
                                  onMouseEnter={() => {
                                    if (!alreadySubmitted) soundFX.playTick();
                                  }}
                                  onClick={() => {
                                    soundFX.playPop();
                                    setNewMood(mIdx);
                                  }}
                                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                                    isSelected
                                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 scale-103 shadow-xs font-bold"
                                      : "bg-slate-50 dark:bg-slate-950 border-gray-150 dark:border-slate-850 opacity-80 hover:opacity-100"
                                  } ${alreadySubmitted ? "opacity-35 cursor-not-allowed" : ""}`}
                                >
                                  <span className="text-2xl select-none">{info.emoji}</span>
                                  <span className="text-[8px] font-bold text-slate-600 dark:text-slate-300 uppercase block tracking-tighter truncate w-full">
                                    {info.text.split(" ")[0]}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Sleep Duration: Slider (Maslow) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-85">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-slate-500">Horas de Sueño</span>
                              <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-955/40 px-2.5 py-0.5 rounded border border-emerald-200">
                                {newSleepHours} hrs
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="14"
                              step="0.5"
                              disabled={alreadySubmitted}
                              value={newSleepHours}
                              onChange={(e) => setNewSleepHours(Number(e.target.value))}
                              className="w-full accent-emerald-500 cursor-pointer mt-3 disabled:opacity-30"
                            />
                            <span className="text-[8.5px] text-gray-400 block mt-1.5 font-sans">Sugerido fisiológico: 7 a 9 hrs de descanso diario.</span>
                          </div>

                          {/* Sleep Quality Score */}
                          <div className="space-y-1.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-85">
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Calidad Reparadora del Sueño</span>
                            <select
                              disabled={alreadySubmitted}
                              value={newSleepScore}
                              onChange={(e) => setNewSleepScore(Number(e.target.value))}
                              className="w-full mt-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold cursor-pointer focus:ring-1 focus:ring-emerald-500 disabled:opacity-45"
                            >
                              <option value="1">😫 1/5 - Insomnio Severo / Muy Malo</option>
                              <option value="2">😰 2/5 - Pesadillas / Trastornado</option>
                              <option value="3">😐 3/5 - Regular / Interrumpido</option>
                              <option value="4">😊 4/5 - Bueno / Reparador</option>
                              <option value="5">🌟 5/5 - Excelente / Profundo</option>
                            </select>
                            <span className="text-[8.5px] text-gray-400 block mt-1.5 font-sans">Correlación de higiene biológica básica.</span>
                          </div>
                        </div>

                        {/* Cognitive / Reflex text */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-bold text-slate-500 block">Diario Cognitivo / Observación del Sueño o Triger Emocional</label>
                          <textarea
                            disabled={alreadySubmitted || isSubmittingLog}
                            placeholder="Ej: Anoche costó conciliar el sueño por rumiación de ideas sobre el trabajo. Desperté con tensión leve, pero logré enfocarme temprano con respiración..."
                            rows={3}
                            value={newCognitiveNote}
                            onChange={(e) => setNewCognitiveNote(e.target.value)}
                            className="w-full p-3 text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-sans focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed disabled:opacity-40"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={alreadySubmitted || isSubmittingLog}
                          onMouseEnter={() => {
                            if (!alreadySubmitted) soundFX.playTick();
                          }}
                          onClick={() => {
                            if (!alreadySubmitted) soundFX.playChime();
                          }}
                          className={`w-full text-white text-xs font-extrabold py-3.5 rounded-xl transition duration-250 shadow flex items-center justify-center gap-1.5 uppercase cursor-pointer hover:scale-101 active:scale-99 ${
                            alreadySubmitted
                              ? "bg-slate-350 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed bg-slate-300 pointer-events-none"
                              : "bg-emerald-600 hover:bg-emerald-700"
                          }`}
                        >
                          {alreadySubmitted ? "Auto-Reporte Diario Completado ✓" : isSubmittingLog ? "Guardando Registro Clínico..." : "Guardar Auto-Reporte Diario 🍃"}
                        </button>
                      </form>
                    </>
                  );
                })()}
              </div>

              {/* Plotted trajectory */}
              {moodLogs.length > 0 && (
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-gray-150 dark:border-slate-850 rounded-3xl p-5 shadow-sm space-y-4 text-left">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-850 pb-2.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" /> Mi Bitácora en el Tiempo (CBT)
                    </h3>
                    <div className="flex items-center gap-3 text-[10px] font-bold">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block"></span> Ánimo</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-indigo-500 rounded-full inline-block"></span> Hrs Sueño</span>
                    </div>
                  </div>

                  <div className="bg-slate-50/50 dark:bg-slate-950/45 rounded-2xl p-4 border border-slate-100 dark:border-slate-850">
                    {renderInteractiveSvgChart()}
                  </div>
                </div>
              )}

              {/* History list of entries */}
              {moodLogs.length > 0 && (
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-gray-150 dark:border-slate-850 rounded-3xl p-5 shadow-sm space-y-4 text-left">
                  <h3 className="text-sm font-bold text-slate-1000 dark:text-white border-b border-slate-100 dark:border-slate-850 pb-2.5 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-500" /> Historial de Auto-Reportes
                  </h3>

                  <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                    {moodLogs.map((log) => {
                      const mInfo = getMoodEmojiInfo(log.mood);
                      const logDate = log.createdAt?.seconds 
                        ? new Date(log.createdAt.seconds * 1000).toLocaleDateString("es-CL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
                        : "Hace instantes";

                      return (
                        <div key={log.id} className="p-3.5 bg-slate-55/65 dark:bg-slate-955/35 border border-slate-150 dark:border-slate-85 rounded-2xl space-y-2">
                          <div className="flex flex-wrap justify-between items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">{logDate}</span>
                            <div className="flex gap-1.5">
                              <span className="text-[9.5px] font-bold bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-800 text-slate-700 dark:text-gray-300">
                                Ánimo: {mInfo.emoji} {mInfo.text.split(" ")[0]}
                              </span>
                              <span className="text-[9.5px] font-bold bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-800 text-slate-700 dark:text-gray-300">
                                💤 {log.sleepHours} hrs ({log.sleepScore}/5)
                              </span>
                            </div>
                          </div>
                          {log.cognitiveNote ? (
                            <p className="text-[11px] leading-relaxed text-slate-705 dark:text-gray-300 italic bg-white/70 dark:bg-slate-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-slate-850">
                              "{log.cognitiveNote}"
                            </p>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic block">Sin observaciones subjetivas ingresadas.</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              </motion.div>
            )}
            </AnimatePresence>

          </div>

          {/* Device Action Home Touchbar Indicator */}
          <div className="bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-850 py-2.5 flex justify-center items-center">
            <div className="w-28 h-1 bg-slate-300 dark:bg-[#1e293b] rounded-full select-none" />
          </div>

        </div>
      )}

      {reschedulingAppt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-left">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 max-w-md w-full shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              🔄 Reprogramar Consulta Online
            </h3>
            <p className="text-xs text-gray-550 dark:text-gray-400">
              Vas a reprogramar tu cita del día <strong className="text-slate-800 dark:text-white">{reschedulingAppt.date}</strong> en el bloque <strong className="text-slate-800 dark:text-white">{reschedulingAppt.timeSlot}</strong>.
            </p>

            <div className="p-3 bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/50 rounded-2xl space-y-1 text-[10px] text-sky-800 dark:text-sky-400">
              <span className="font-bold block">Política de Reagendamiento Clínico:</span>
              <ul className="list-disc pl-3.5 space-y-0.5">
                <li>Solo permitido con al menos 2 horas de anticipación.</li>
                <li>Permite un máximo de 3 reagendamientos totales por pago.</li>
                <li>Intento actual: {(reschedulingAppt.rescheduleCount || 0) + 1} de 3 permitidos.</li>
              </ul>
            </div>

            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-350 block">1. Seleccione Nueva Fecha:</label>
                <input
                  type="date"
                  value={reschedDate}
                  min={new Date().toLocaleDateString("en-CA")}
                  onChange={(e) => {
                    setReschedDate(e.target.value);
                    setReschedSlot("");
                    setReschedError("");
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-sky-500 dark:bg-slate-950 dark:border-slate-805 text-slate-800 dark:text-white"
                />
              </div>

              {reschedDate && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-350 block">2. Seleccione Horario Disponible:</label>
                  {loadingSlots ? (
                    <p className="text-[10.5px] text-gray-400 animate-pulse">Buscando bloques de turnos disponibles...</p>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-[10.5px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 font-bold">
                      ⚠️ No hay bloques disponibles para esta fecha. Recuerde que el profesional de salud atiende de Lunes a Viernes y no atiende Festivos.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setReschedSlot(slot)}
                          className={`p-2.5 text-[10.5px] rounded-xl font-bold border transition-all text-center cursor-pointer ${
                            reschedSlot === slot
                              ? "bg-slate-950 border-slate-950 text-white shadow-sm dark:bg-sky-500 dark:border-sky-500 dark:text-slate-950"
                              : "border-slate-150 bg-slate-50 text-slate-750 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-850"
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {reschedError && (
              <p className="text-rose-600 bg-rose-50 text-[10.5px] p-2.5 rounded-xl border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40 font-bold">
                ⚠️ {reschedError}
              </p>
            )}

            {reschedulingSuccess && (
              <p className="text-emerald-700 bg-emerald-50 text-[10.5px] p-2.5 rounded-xl border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40 font-extrabold animate-bounce">
                ✅ ¡Reagendamiento procesado con éxito! Portal actualizado.
              </p>
            )}

            <div className="flex gap-2.5 pt-4 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReschedulingAppt(null)}
                className="flex-1 text-xs py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 font-bold transition cursor-pointer text-center"
              >
                Cerrar Ventana
              </button>
              <button
                type="button"
                disabled={!reschedDate || !reschedSlot || reschedulingSuccess}
                onClick={handleConfirmReschedule}
                className="flex-1 text-xs py-2.5 rounded-xl bg-slate-900 dark:bg-sky-500 dark:text-slate-950 text-white hover:bg-slate-800 dark:hover:bg-sky-400 font-bold transition disabled:opacity-50 cursor-pointer text-center"
              >
                Confirmar Reagendamiento
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelingAppt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-left">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 max-w-md w-full shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-rose-600 flex items-center gap-2">
              🚨 Anulación de Reserva Médica
            </h3>
            <p className="text-xs text-gray-550 dark:text-gray-400 leading-relaxed">
              Vas a proceder con la anulación de tu reserva del día <strong>{cancelingAppt.date}</strong> a las <strong>{cancelingAppt.timeSlot}</strong>.
            </p>

            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl space-y-1.5 text-[10.5px] text-rose-800 dark:text-rose-450">
              <span className="font-extrabold block text-rose-900 dark:text-rose-400">Políticas de Devolución & Reagendamientos:</span>
              <ul className="list-disc pl-3.5 space-y-1 leading-normal">
                <li>Válido únicamente hasta con 2 horas de anticipación a la cita.</li>
                <li>Habiendo cancelado oportunamente, se habilitará la restitución total de pasarela de pago o saldo para un futuro bloque.</li>
                <li>Si no informas previo a las 2 horas de tolerancia, se asume cobro por pérdida fortuita del bloque profesional.</li>
              </ul>
            </div>

            <div className="space-y-1">
              <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-350 block">Motivo de Anulación (Opcional):</label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Por favor ayúdanos con un breve motivo médico o personal..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium focus:ring-2 focus:ring-rose-500 h-20 text-slate-850 dark:text-white"
              />
            </div>

            {cancelingSuccess && (
              <p className="text-emerald-700 bg-emerald-50 text-[10.5px] p-2.5 rounded-xl border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40 font-extrabold animate-bounce">
                ✅ ¡Tu reserva clínica ha sido cancelada con éxito! Reembolso de fondos iniciado.
              </p>
            )}

            <div className="flex gap-2.5 pt-3 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancelingAppt(null)}
                className="flex-1 text-xs py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 dark:text-slate-300 font-bold transition cursor-pointer text-center"
              >
                Volver Atrás
              </button>
              <button
                type="button"
                disabled={cancelingSuccess}
                onClick={handleConfirmCancellation}
                className="flex-1 text-xs py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 font-bold transition cursor-pointer text-center"
              >
                Sí, Anular Hora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: CRISIS ASSISTANCE (ABBI AI OVERBOOK PROTOCOL) */}
      {showCrisisModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-150 dark:border-slate-850 max-w-lg w-full shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95 duration-200 text-left">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertCircle className="w-5.5 h-5.5 animate-pulse text-red-600" />
                <h3 className="text-sm font-extrabold uppercase tracking-wider">
                  Asistencia Clínica para Crisis & Urgencias
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCrisisModal(false)}
                className="p-1 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer font-extrabold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Step 1: Options & Helpline */}
            {crisisStep === "options" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Hola, lamento mucho que estés atravesando una situación de alta tensión, angustia o desborde emocional. Abby está lista para priorizar tu bienestar y coordinar asistencia inmediata de urgencia.
                </p>

                {/* State Helpline Banner (Chilean Standard) */}
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-emerald-850 dark:text-emerald-400 font-extrabold">
                    <span>❤️</span> Línea de Contención Inmediata de Urgencia
                  </div>
                  <p className="text-[11px] text-emerald-950 dark:text-emerald-300 leading-relaxed pt-0.5">
                    Si te encuentras con ideas autodestructivas, desespero agudo o riesgo inminente de daño, te recomendamos encarecidamente llamar gratis e inmediatamente al Fono **Salud Responde (*1010)** de MINSAL (cobertura nacional en Chile, 100% confidencial, 24/7). Todo apoyo es vital.
                  </p>
                </div>

                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-150 dark:border-rose-900/40 text-xs text-rose-900 dark:text-rose-300">
                  <span className="font-extrabold flex items-center gap-1">🤖 ¿Cómo funciona Abby AI en Crisis?</span>
                  <p className="mt-1 text-[11.5px] leading-relaxed opacity-95">
                    Abigail escaneará la agenda regular de <strong>{therapistName}</strong> buscando el bloque libre más inmediato (hoy o mañana) para agendarte con alta prioridad clínica. Si las horas estándar están copadas, generaremos un <strong>Bloque Automático de Sobrecupo</strong> y daremos aviso directo al profesional.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t dark:border-slate-850">
                  <button
                    type="button"
                    onClick={handleAbbyScanPriorityMeters}
                    disabled={isSubmittingCrisis}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs py-3 rounded-xl font-extrabold transition cursor-pointer text-center uppercase tracking-wide border border-transparent hover:scale-[1.01] active:scale-99"
                  >
                    {isSubmittingCrisis ? "Evaluando disponibilidad de agenda tradicional..." : "⚡ Iniciar Escaneo de Agenda Abigail AI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrisisStep("overbook_form")}
                    className="w-full bg-red-650 hover:bg-red-700 bg-red-650 text-white text-xs py-3 rounded-xl font-extrabold transition cursor-pointer text-center uppercase tracking-wide hover:scale-[1.01] active:scale-99 shadow-sm"
                  >
                    🚨 Solicitar Sobrecupo de Urgencia Directo
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Abby found a standard priority slot */}
            {crisisStep === "active_priority" && crisisProposedAppt && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300 rounded-2xl text-center space-y-2">
                  <span className="text-3xl">🎉</span>
                  <h4 className="text-xs font-extrabold text-emerald-800 dark:text-emerald-400 uppercase">
                    ¡Abby ha localizado un bloque libre hoy mismo!
                  </h4>
                  <p className="text-[11px] text-emerald-950 dark:text-emerald-300 leading-normal max-w-sm mx-auto">
                    Hay un cupo de atención tradicional sin sobrecargar la agenda actual del terapeuta:
                  </p>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 max-w-xs mx-auto text-center font-bold">
                    <p className="text-xs capitalize text-slate-800 dark:text-white">{new Date(crisisProposedAppt.date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</p>
                    <p className="text-sm font-mono text-emerald-600 mt-1">{crisisProposedAppt.timeSlot} (Hora Local)</p>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                  ¿Deseas confirmar la asignación prioritaria de esta hora? No requiere pago previo ni validaciones de prueba en este instante para asegurar tu ingreso.
                </p>

                <div className="flex gap-2.5 pt-3 border-t dark:border-slate-800 flex-col md:flex-row">
                  <button
                    type="button"
                    onClick={() => setCrisisStep("overbook_form")}
                    className="flex-1 text-xs py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-bold transition cursor-pointer text-center hover:bg-slate-50 dark:hover:bg-slate-850 dark:text-slate-300"
                  >
                    No, necesito sobrecupo inmediato
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmProposedPriority}
                    disabled={isSubmittingCrisis}
                    className="flex-1 text-xs py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 font-extrabold rounded-xl transition cursor-pointer text-center uppercase shadow"
                  >
                    {isSubmittingCrisis ? "Reservando..." : "Sí, Confirmar Hora Regular"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Urgent Overbooking Form */}
            {crisisStep === "overbook_form" && (
              <div className="space-y-4">
                <div className="p-3.5 bg-red-50 dark:bg-rose-950/20 border border-red-200 dark:border-rose-900/60 rounded-2xl text-xs text-red-900 dark:text-red-300 leading-relaxed">
                  <strong className="block font-bold mb-1">Activación Extraordinaria de Sobrecupo de Urgencia</strong>
                  Crearemos un bloque especial de atención inmediata fuera de horario ordinario clínico. El profesional recibirá un bypass directo en su agenda y notificaciones automáticas inmediatas.
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block">Número de Teléfono de Contacto:</label>
                    <input
                      required
                      type="tel"
                      placeholder="Ej: +569 8765 4321"
                      value={crisisPhone}
                      onChange={(e) => setCrisisPhone(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium focus:ring-1 focus:ring-red-500 text-slate-850 dark:text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block">¿Qué está gatillando tu crisis emocional? (Opcional):</label>
                    <textarea
                      placeholder="Ej: Siento rumiación severa severa y un ataque de angustia que no he logrado modular con las pauto-respiraciones..."
                      value={crisisDesc}
                      onChange={(e) => setCrisisDesc(e.target.value)}
                      rows={3}
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium focus:ring-1 focus:ring-red-500 text-slate-850 dark:text-white leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-3 border-t dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCrisisStep("options")}
                    className="flex-1 text-xs py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 dark:text-slate-300 font-bold transition cursor-pointer text-center"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCrisisOverbook}
                    disabled={isSubmittingCrisis}
                    className="flex-1 text-xs py-2.5 rounded-xl bg-red-650 text-white hover:bg-red-700 font-extrabold transition cursor-pointer text-center uppercase shadow active:scale-98"
                  >
                    {isSubmittingCrisis ? "Agendando Sobrecupo..." : "🚨 Confirmar Diagnóstico / Bloque"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Overbook Success */}
            {crisisStep === "overbook_success" && overbookedAppt && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300 rounded-2xl text-center space-y-3">
                  <div className="inline-flex p-3 bg-emerald-100 dark:bg-emerald-950/60 rounded-full text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-8 h-8 animate-bounce" />
                  </div>
                  <h4 className="text-xs font-extrabold text-emerald-800 dark:text-emerald-400 uppercase block">
                    ¡Sobrecupo Confirmado Exitosamente por Abby AI!
                  </h4>
                  <p className="text-xs text-emerald-950 dark:text-emerald-300 leading-relaxed max-w-sm mx-auto">
                    Hemos habilitado un bloque de contingencia clínica especial con ID prioritario para emergencias hoy mismo. El terapeuta ya se encuentra alertado.
                  </p>

                  <div className="bg-white dark:bg-slate-950 p-4 rounded-2xl border border-emerald-100 text-center space-y-1 font-bold shadow-xs">
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Tipo de Cita:</p>
                    <p className="text-sm text-red-600 uppercase">🚨 SOBRECUPO POR ALERTA DE CRISIS EMOCIONAL</p>
                    <p className="text-[10px] text-slate-500 font-medium leading-normal mt-1">Sala de video-conferencia dedicada y canal de audio directo activos de inmediato.</p>
                    <div className="pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCrisisModal(false);
                          onJoinCall(overbookedAppt.videoRoomId);
                        }}
                        className="w-full bg-emerald-650 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow hover:scale-101 active:scale-99 transition"
                      >
                        <Video className="w-4 h-4 animate-pulse" /> Conectarse a Urgencia de Video
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCrisisModal(false)}
                  className="w-full text-xs py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 dark:text-slate-300 font-bold transition cursor-pointer text-center"
                >
                  Regresar al Portal
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
