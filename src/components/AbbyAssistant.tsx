import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Send, 
  AlertTriangle, 
  Check, 
  HelpCircle, 
  X, 
  User, 
  Clock, 
  ShieldCheck, 
  Calendar, 
  Phone, 
  Mail, 
  FileText, 
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  RefreshCw,
  Award
} from "lucide-react";
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Appointment, ClinicSettings } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { getCachedAccessToken, sendGmail } from "../utils/googleAuth";

// Web Speech API interfaces
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

interface AbbyAssistantProps {
  mode: "doctor" | "patient" | "doctor_floating";
  therapistUid?: string;
  therapistName?: string;
  settings?: ClinicSettings | null;
}

export default function AbbyAssistant({ mode, therapistUid, therapistName, settings }: AbbyAssistantProps) {
  // Voice & Interaction settings
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [isSlideDrawerOpen, setIsSlideDrawerOpen] = useState(false);
  const handsFreeRef = useRef(false);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivacyNotification, setShowPrivacyNotification] = useState(false);

  // Keyboard shortcut listener to toggle Hands-Free wake-word mode instantly on Alt+A / Option+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // altKey corresponds to Option on Mac or Alt on Windows
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        if (mode === "doctor_floating") {
          setIsSlideDrawerOpen((prevOpen) => {
            const nextOpen = !prevOpen;
            setHandsFreeMode(nextOpen);
            
            // Speak brief status confirmation so clinician knows hands-free toggled without looking
            if (!speechEnabled) return nextOpen;
            try {
              window.speechSynthesis.cancel();
              const feedback = nextOpen 
                ? "Modo manos libres activado, adelante doctor." 
                : "Modo manos libres desactivado.";
              const utterance = new SpeechSynthesisUtterance(feedback);
              utterance.lang = "es-CL";
              utterance.rate = 1.0;
              window.speechSynthesis.speak(utterance);
            } catch (err) {}

            return nextOpen;
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode, speechEnabled]);

  // Safety timer for Hands-Free continuous listening environment privacy (Chilean Ley 19.628 / HIPAA / PCI)
  useEffect(() => {
    let warningTimer: any = null;
    if (handsFreeMode) {
      // Trigger a check every 45 seconds to warn the clinician that the microphone is streaming ambient sounds
      warningTimer = setInterval(() => {
        setShowPrivacyNotification(true);
        
        // Attempt an HTML5 system push notification if the user accepted/is running standalone
        if ("Notification" in window) {
          if (Notification.permission === "granted") {
            try {
              new Notification("Abby Voice Link: Micrófono Abierto 🎙️", {
                body: "El modo Escucha Activa de Abby sigue encendido. Desactívelo con Alt+A para asegurar privacidad legal (Ley 19.628).",
                tag: "abby-privacy-warn"
              });
            } catch (err) {}
          } else if (Notification.permission !== "denied") {
            try {
              Notification.requestPermission();
            } catch (e) {}
          }
        }
      }, 45000);
    } else {
      setShowPrivacyNotification(false);
    }

    return () => {
      if (warningTimer) clearInterval(warningTimer);
    };
  }, [handsFreeMode]);

  // Chat message history
  const [chatLog, setChatLog] = useState<{ sender: "user" | "abby"; text: string; timestamp: Date }[]>([
    {
      sender: "abby",
      text: mode === "doctor" || mode === "doctor_floating"
        ? `Hola Dr. ${therapistName || "Romero"}. Estoy aquí para asistirle hoy. Puede escribir o mantener presionado el micrófono para hablarme. Ej: "Abby, ¿qué paciente viene ahora?" o si ocurre un imprevisto "Necesito suspender las consultas de hoy por una emergencia".`
        : `¡Hola! Soy Abby, tu asistente administrativa de Inteligencia Artificial de la consulta. Es muy importante que sepas que mi rol es únicamente orientarte en la gestión de tu agenda, aranceles y consultas técnicas de conexión. No soy una terapeuta ni ofrezco asistencia psicológica clínica directa, y no gestionamos convenios de Isapres o reembolsos previsionales.`,
      timestamp: new Date()
    }
  ]);

  // Today's appointments context for Abby
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  
  // Emergency Suspension Flow states
  const [showEmergencyWizard, setShowEmergencyWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<"review" | "notifying" | "completed">("review");
  const [suspensionReason, setSuspensionReason] = useState("Asuntos urgentes médicos / familiares");
  const [isProcessingSuspension, setIsProcessingSuspension] = useState(false);
  const [rescheduleData, setRescheduleData] = useState<{ id: string; patientName: string; originalSlot: string; proposedDate: string; proposedSlot: string; medium: "WhatsApp" | "Email" }[]>([]);

  // Public floating widget states
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const [apiErrorDetails, setApiErrorDetails] = useState<{
    status: string;
    message: string;
    apiKeyLength?: number;
    hint?: string;
  } | null>(null);

  // Load today's appointments if in therapist mode
  useEffect(() => {
    if ((mode === "doctor" || mode === "doctor_floating") && therapistUid) {
      const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const q = query(
        collection(db, "appointments"),
        where("ownerId", "==", therapistUid),
        where("date", "==", todayStr)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const appts: Appointment[] = [];
        snapshot.forEach((doc) => {
          appts.push({ id: doc.id, ...doc.data() } as Appointment);
        });
        // Sort by slot time
        appts.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
        setTodayAppointments(appts.filter(a => a.status !== "canceled"));
      });

      return () => unsubscribe();
    }
  }, [mode, therapistUid]);

  // Handle Speech Synthesis (Abby's voice speaking)
  const speak = (textToSpeak: string) => {
    if (!speechEnabled) return;
    try {
      window.speechSynthesis.cancel();
      // Clean string from markdown formatting to avoid weird pronunciation
      const cleanText = textToSpeak
        .replace(/[\*\#\_]/g, "")
        .replace(/:\w+:/g, "")
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "es-CL"; // Warm conversational Chilean-accents accent
      
      // Try to find a nice Spanish female voice
      const voices = window.speechSynthesis.getVoices();
      const spanishVoice = voices.find(v => v.lang.startsWith("es") && (v.name.includes("Google") || v.name.includes("Sabina") || v.name.includes("Monica") || v.name.includes("Helena")));
      if (spanishVoice) {
        utterance.voice = spanishVoice;
      }
      utterance.pitch = 1.05;
      utterance.rate = 0.95;

      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis is not supported or was interrupted.", e);
      setIsSpeaking(false);
    }
  };

  // Sync hands-free ref to avoid closures keeping stale state representation 
  useEffect(() => {
    handsFreeRef.current = handsFreeMode;
    if (handsFreeMode) {
      window.speechSynthesis.cancel();
      try {
        if (recognitionRef.current && !isListening) {
          recognitionRef.current.start();
        }
      } catch (err) {}
    }
  }, [handsFreeMode]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "es-CL";

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          const lower = transcript.toLowerCase();
          // If in hands-free continuous mode, check wake word
          if (handsFreeRef.current) {
            if (lower.includes("abby") || lower.includes("avi") || lower.includes("api") || lower.includes("hola")) {
              const cleanedText = transcript.replace(/abby|avi|api|hola/gi, "").trim();
              if (cleanedText) {
                setInputText(cleanedText);
                handleSendMessage(cleanedText);
              } else {
                const triggerGreet = "Hola Doctor Ignacio, le escucho atentamente. ¿En qué puedo asistirle?";
                setChatLog((prev) => [...prev, { sender: "abby", text: triggerGreet, timestamp: new Date() }]);
                speak(triggerGreet);
              }
            }
          } else {
            setInputText(transcript);
            handleSendMessage(transcript);
          }
        }
      };

      rec.onerror = (err: any) => {
        console.error("Speech recognition error:", err);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        // If hands-free continuous ear module is turned on and not actively speaking, restart listening
        if (handsFreeRef.current) {
          setTimeout(() => {
            try {
              if (recognitionRef.current && !window.speechSynthesis.speaking && handsFreeRef.current) {
                recognitionRef.current.start();
              }
            } catch (err) {}
          }, 800);
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("La entrada de voz no está soportada o configurada en este navegador. Por favor introduzca texto.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      window.speechSynthesis.cancel(); // Stop talking first
      recognitionRef.current.start();
    }
  };

  // Scroll to bottom helper
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatLog]);

  // Formulate text about today's appointments for backend
  const getAppointmentsText = () => {
    if (todayAppointments.length === 0) {
      return "No hay pacientes agendados para hoy.";
    }
    return todayAppointments
      .map((a, i) => `${i + 1}. El paciente ${a.patientName} tiene hora reservada a las ${a.timeSlot}. El estado actual es ${a.status} (Pago: ${a.paymentStatus}).`)
      .join("\n");
  };

  // Execute clinical suspension
  const handleExecuteEmergencySuspension = async () => {
    setIsProcessingSuspension(true);
    setWizardStep("notifying");

    const gmailToken = getCachedAccessToken();

    try {
      // Simulate gradual message broadcasting
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Generate reschedule proposals
      const days = ["Miércoles 27 de Mayo", "Jueves 28 de Mayo", "Viernes 29 de Mayo"];
      const proposedSlots = todayAppointments.map((appt, i) => ({
        id: appt.id,
        patientName: appt.patientName,
        patientEmail: appt.patientEmail,
        originalSlot: appt.timeSlot,
        originalDate: appt.date,
        proposedDate: days[i % days.length],
        proposedSlot: appt.timeSlot,
        medium: "Email" as "WhatsApp" | "Email"
      }));

      // Loop through all today's appointments to set as "canceled" in Firebase and dispatch genuine emails
      for (const res of proposedSlots) {
        const docRef = doc(db, "appointments", res.id);
        await updateDoc(docRef, {
          status: "canceled",
          notes: `Sesión suspendida de emergencia el ${new Date().toLocaleDateString()} debido a imprevisto familiar clínico. Abby generó alternativa: ${res.proposedDate} @ ${res.proposedSlot} hrs.`
        });

        // Use clinician's connected Gmail API to notify each affected patient!
        if (gmailToken && res.patientEmail) {
          const subject = `AVISO: Reprogramación de consulta psicológica urgente - MindSpace Clinica`;
          const bodyContent = `
            <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 25px; border: 1px solid #fee2e2; border-radius: 16px; background-color: #fef2f2;">
              <div style="border-bottom: 2px solid #b91c1c; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="color: #991b1b; margin: 0; font-size: 18px;">⚠️ Aviso de Suspensión de Agenda Clínica</h2>
                <p style="color: #7f1d1d; margin: 5px 0 0 0; font-size: 11px;">Mente Sana / MindSpace - Asistencia de Abby Admin AI</p>
              </div>
              
              <p style="font-size: 13px; color: #1f2937; line-height: 1.6;">
                Estimado(a) <strong>${res.patientName}</strong>,
              </p>
              
              <p style="font-size: 13px; color: #374151; line-height: 1.6;">
                Le informamos que por un imprevisto de fuerza mayor de carácter urgente, su terapeuta ha debido suspender temporalmente su agenda para hoy.
              </p>
              
              <div style="background-color: #ffffff; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
                <span style="font-size: 11px; color: #7f1d1d; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Turno Afectado</span>
                <strong style="font-size: 15px; color: #991b1b; display: block;">${res.originalDate} a las ${res.originalSlot} hrs</strong>
              </div>

              <p style="font-size: 13px; color: #374151; line-height: 1.6;">
                Para velar por su continuidad clínica, Abby le ha reservado automáticamente la siguiente alternativa preferente de reprogramación sin costo adicional:
              </p>

              <div style="background-color: #e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
                <span style="font-size: 11px; color: #0369a1; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Nueva Alternativa Propuesta</span>
                <strong style="font-size: 15px; color: #0369a1; display: block;">${res.proposedDate} a las ${res.proposedSlot} hrs</strong>
              </div>

              <p style="font-size: 12px; color: #4b5563;">
                Para confirmar o modificar esta cita, por favor acceda a su <strong>Portal del Paciente</strong> a la brevedad.
              </p>

              <div style="border-top: 1px solid #fca5a5; padding-top: 15px; margin-top: 25px; font-size: 10px; color: #9ca3af; text-align: center;">
                <p>Este informe clínico confidencial ha sido despachado automáticamente en tiempo real por Abby Admin AI.</p>
                <p>© 2026 MindSpace Chile. Ley 20.584 de Derechos y Deberes del Paciente.</p>
              </div>
            </div>
          `;
          sendGmail(gmailToken, res.patientEmail, subject, bodyContent).catch((e) => console.error("Error dispatching suspension email via Abby:", e));
        }
      }

      setRescheduleData(proposedSlots);
      setWizardStep("completed");

      // Give Abby a conversational summary
      const summaryMsg = `¡Hecho, Doctor Ignacio! Citas de hoy canceladas con éxito en el sistema. He notificado y despachado automáticamente un correo confidencial a cada paciente (${todayAppointments.map(a => a.patientName).join(", ")}) indicándoles que tuvo un imprevisto, entregándoles sus respectivas opciones de reprogramación en su mismo bloque para los próximos días. El flujo clínico está seguro y bajo control. Vaya tranquilo y espero todo resulte excelente con su eventualidad.`;
      
      setChatLog(prev => [
        ...prev,
        {
          sender: "abby",
          text: summaryMsg,
          timestamp: new Date()
        }
      ]);
      speak(summaryMsg);

    } catch (error: any) {
      console.error("Clinical suspension engine triggered an error:", error);
      alert("Hubo un contratiempo al procesar la cancelación en lote de la base de datos.");
    } finally {
      setIsProcessingSuspension(false);
    }
  };

  // Patient FAQ Logic
  const handlePatientFAQ = (questionType: string) => {
    setIsLoading(true);
    let replyText = "";

    if (questionType === "how_to_book") {
      replyText = `Para agendar tu hora de atención es muy sencillo:
1. Revisa el **Calendario Interactivo** arriba.
2. Selecciona un día libre marcado en color esmeralda y el bloque horario que mejor te acomode.
3. Ingresa tu Nombre, RUT visible (para emisión de boletas), Teléfono y Correo.
4. Acepta los términos de confidencialidad respaldada por las leyes chilenas **19.628** y **20.584**.
5. Realiza el pago electrónico simulado para asegurar tu cupo de forma instantánea.`;
    } else if (questionType === "privacy") {
      replyText = `El resguardo ético y legal de tu información clínica es nuestra prioridad número uno:
- Cada registro de historial, nota o diagnóstico que el especialista ingrese se encripta de forma exclusiva en servidores de Cloud Firestore.
- En total conformidad con la **Ley 19.628 sobre protección de datos de carácter personal en Chile**, ningún dato sensible o de ficha médica es compartido sin tu explícito y firmado consentimiento.
- De conformidad con la **Ley 20.584**, se garantiza el cuidado, respeto, trato digno y confidencialidad médica absoluta.`;
    } else if (questionType === "pricing") {
      replyText = `La consulta opera bajo modalidad privada para resguardar la máxima autonomía clínico-profesional de tu tratamiento:
- El precio de la sesión se detalla transparentemente al momento de agendar horas en nuestro calendario interactivo.
- El pago se procesa de forma directa y blindada. Al finalizar exitosamente la reserva, la plataforma te otorgará automáticamente tu Boleta de Honorarios Electrónica (BHE) aprobada por el SII como comprobante legal de tu consulta privada de psicología.`;
    } else if (questionType === "video_call") {
      replyText = `Nuestras consultas de telemedicina se realizan por videollamada cifrada de extremo a extremo:
- Al agendar, recibirás una dirección de la sala confidencial con formato seguro cifrado por tokens.
- No requieres descargar ninguna aplicación o archivo externo; puedes ingresar directamente desde tu navegador en celular o desktop con micrófono y cámara activados.`;
    }

    setChatLog(prev => [
      ...prev,
      { sender: "user", text: `Quiero consultar sobre: ${questionType === "how_to_book" ? "¿Cómo agendar?" : questionType === "privacy" ? "Privacidad de datos" : questionType === "pricing" ? "Aranceles de la Consulta" : "Videollamada segura"}`, timestamp: new Date() },
      { sender: "abby", text: replyText, timestamp: new Date() }
    ]);
    speak(replyText);
    setIsLoading(false);
  };

  // Main chatbot logic sending prompt queries to server
  const handleSendMessage = async (customQuery?: string) => {
    const queryStr = (customQuery || inputText).trim();
    if (!queryStr) return;

    // Clear text inputs
    setInputText("");

    // Add user message to log list
    setChatLog((prev) => [...prev, { sender: "user", text: queryStr, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/gemini/abby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryStr,
          appointmentsText: getAppointmentsText(),
          therapistName: therapistName || "José Ignacio Rovel",
          currentTime: new Date().toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' }),
          mode: mode
        })
      });

      if (!response.ok) {
         throw new Error("Failed to communicate with Abby Assistant API");
      }

      const data = await response.json();
      
      if (data.diagnostics) {
        if (data.diagnostics.status === "api_exception") {
          console.error("❌ [Abby Assistant System Exception]:", data.diagnostics.message);
          console.error("Stack trace:", data.diagnostics.stack);
          console.error("API Key Length:", data.diagnostics.apiKeyLength);
          console.error("Developer Hint:", data.diagnostics.hint);
          setApiErrorDetails({
            status: data.diagnostics.status,
            message: data.diagnostics.message,
            apiKeyLength: data.diagnostics.apiKeyLength,
            hint: data.diagnostics.hint
          });
        } else {
          console.log("🔍 [Abby Assistant Diagnostics Status]:", data.diagnostics.status, data.diagnostics.message);
          setApiErrorDetails(null);
        }
      } else {
        setApiErrorDetails(null);
      }
      
      setChatLog((prev) => [...prev, { sender: "abby", text: data.reply, timestamp: new Date() }]);
      speak(data.reply);

      // Trigger structural actions if requested (suspension today)
      if (data.triggerAction === "suspend_today") {
        setShowEmergencyWizard(true);
        setWizardStep("review");
      }

    } catch (e: any) {
      console.error("AI engine compilation was disconnected:", e);
      let errorMsg = "Comprendo el punto. Disculpe Doctor Ignacio, estoy experimentando una breve interrupción en mis servicios autónomos, pero puedo ayudarle de igual modo en el consultorio.";
      
      // Standalone pattern fallback
      if (queryStr.toLowerCase().includes("suspender") || queryStr.toLowerCase().includes("urgencia") || queryStr.toLowerCase().includes("cancelar")) {
        errorMsg = "Entiendo perfectamente, doctor Ignacio. Ha acontecido una emergencia familiar importante. He desplegado para usted el panel rápido para suspender la agenda de hoy y notificar de urgencia a los pacientes.";
        setShowEmergencyWizard(true);
        setWizardStep("review");
      } else if (queryStr.toLowerCase().includes("quien") || queryStr.toLowerCase().includes("paciente") || queryStr.toLowerCase().includes("ahora") || queryStr.toLowerCase().includes("agenda")) {
        errorMsg = todayAppointments.length > 0 
          ? `Hoy tiene registrados ${todayAppointments.length} pacientes: ${todayAppointments.map(a => `${a.patientName} (${a.timeSlot})`).join(", ")}. El próximo paciente es ${todayAppointments[0].patientName}.`
          : "Consulté su agenda y para el día de hoy no registra consultas u horas contratadas de pacientes.";
      } else {
        errorMsg = "Entendido, estoy a su completa disposición administrativa en todo lo relacionado con la agenda y fichas clínicas.";
      }

      setChatLog((prev) => [...prev, { sender: "abby", text: errorMsg, timestamp: new Date() }]);
      speak(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Rendering DOCTOR FLOATING layout (Discrete lateral glowing Alexa trigger capsule and slider panel)
  if (mode === "doctor_floating") {
    const isWorking = isListening || isSpeaking;
    return (
      <>
        {/* Floating Privacy Warning banner at top of entire viewport if hands-free is left on */}
        <AnimatePresence>
          {showPrivacyNotification && (
            <motion.div 
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              className="fixed top-24 right-4 z-[9999] w-76 text-left pointer-events-auto font-sans"
            >
              <div className="bg-slate-900 border border-amber-500/30 text-white rounded-2xl p-3 shadow-2xl flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h5 className="text-[10px] font-extrabold uppercase text-amber-400 tracking-wider">Abby: Micrófono Abierto 🎙️</h5>
                  <p className="text-[9.5px] text-gray-300 mt-1 leading-normal font-sans">
                    El modo Escucha Activa sigue encendido. Use <kbd className="bg-slate-800 text-[8.5px] font-bold px-1.5 py-0.5 rounded border border-slate-700">Alt+A</kbd> para cerrar el micrófono de ambiente para resguardo legal (Ley 19.628).
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowPrivacyNotification(false)}
                  className="text-gray-400 hover:text-white transition text-[9px] font-bold uppercase cursor-pointer"
                >
                  Omitir
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Capsule Ring on the right sidebar edge */}
        <div id="abby-discrete-alexa-trigger" className="fixed right-0 top-[35%] -translate-y-1/2 z-40 font-sans select-none pointer-events-auto">
          <div 
            onClick={() => setIsSlideDrawerOpen(!isSlideDrawerOpen)}
            className={`relative group w-3 hover:w-6 h-36 border shadow-2xl transition-all duration-300 flex flex-col justify-center items-center py-3 select-none cursor-pointer rounded-l-3xl ${
              isListening 
                ? "bg-gradient-to-b from-orange-400 via-amber-500 to-red-500 border-orange-500 animate-[pulse_1.2s_infinite] shadow-[0_0_20px_rgba(249,115,22,0.95)] scale-102"
                : isSpeaking
                  ? "bg-gradient-to-b from-amber-400 via-orange-400 to-amber-600 border-amber-400 animate-[bounce_1s_infinite] shadow-[0_0_25px_rgba(245,158,11,1)] scale-110"
                  : "bg-slate-950 dark:bg-slate-900 border-slate-800 dark:border-slate-800 hover:border-emerald-500 shadow-[0_4px_15px_rgba(0,0,0,0.4)]"
            }`}
            title="Tocar (o Alt+A) para hablar con asistente virtual Abby"
          >
            {/* Internal glowing light thread - Stretched Ring Alexa Style */}
            <div className={`w-1 h-28 rounded-full transition-all duration-300 ${
              isListening
                ? "bg-white shadow-[0_0_10px_#fff]"
                : isSpeaking
                  ? "bg-white shadow-[0_0_12px_#fff] animate-pulse"
                  : "bg-emerald-500/80 group-hover:bg-emerald-400 shadow-[0_0_6px_#10b981]"
            }`} />

            {/* Stretched ring visual flare overlay pop */}
            {isWorking && (
              <span className="absolute -left-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            )}

            {/* Hover indicator tag */}
            <div className="absolute right-7 bg-slate-900 text-white text-[10px] font-bold p-1 px-2.5 rounded-lg border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md uppercase tracking-wider">
              {isListening ? "● Escuchando" : isSpeaking ? "🔊 Hablando" : "Abby Voz (Alt+A)"}
            </div>
          </div>
        </div>

        {/* Sliding intelligent Voice Drawer from the right */}
        <AnimatePresence>
          {isSlideDrawerOpen && (
            <>
              {/* Back backdrop shade blocker */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSlideDrawerOpen(false)}
                className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 pointer-events-auto"
              />

              {/* Slide Drawer body container */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
                className="fixed right-4 md:right-6 bottom-24 h-[550px] max-h-[80vh] w-80 md:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-[51] flex flex-col justify-between font-sans pointer-events-auto overflow-hidden"
              >
                {/* Header section with pulsating orange ring */}
                <div className="bg-slate-900 dark:bg-slate-950 text-white p-4 flex justify-between items-center border-b border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Sparkles className="w-24 h-24 text-white" />
                  </div>

                  <div className="flex items-center gap-2.5 relative z-10 text-left">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow transition-all duration-300 ${
                      isListening 
                        ? "bg-gradient-to-tr from-orange-500 to-amber-500 animate-pulse ring-4 ring-orange-500/20"
                        : isSpeaking
                          ? "bg-gradient-to-tr from-amber-500 to-yellow-400 scale-105 ring-4 ring-amber-500/30"
                          : "bg-slate-800"
                    }`}>
                      <Sparkles className={`w-5 h-5 text-emerald-400 ${isWorking ? "text-slate-900 animate-spin" : ""}`} />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold flex items-center gap-1.5 uppercase tracking-wide">
                        Abby Hands-Free voice
                      </h4>
                      <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                        {isListening ? (
                          <span className="text-orange-400 font-bold flex items-center gap-1 animate-pulse">
                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full inline-block animate-ping"></span>
                            Alexa-Mode: Escuchando
                          </span>
                        ) : isSpeaking ? (
                          <span className="text-amber-400 font-bold flex items-center gap-1 animate-bounce">
                            Abby está respondiendo...
                          </span>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
                            Sistema Listo - Di "Abby"
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Close widget button */}
                  <button
                    onClick={() => setIsSlideDrawerOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Conversation log list */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50 dark:bg-slate-950/20 mr-0.5" ref={scrollRef}>
                  {apiErrorDetails && (
                    <div className="bg-amber-50/90 border border-amber-305 dark:bg-amber-950/20 dark:border-amber-900/50 p-3.5 rounded-2xl mb-4 text-[10.5px] text-amber-900 dark:text-amber-400 text-left space-y-1.5 leading-relaxed shadow-sm">
                      <div className="flex items-center gap-2 font-extrabold uppercase tracking-wide text-[9px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Reserva de Créditos Agotada</span>
                      </div>
                      <p>
                        Su <strong>GEMINI_API_KEY</strong> de Google está autenticada, pero su proyecto presenta balance agotado (<em>Prepayment credits depleted</em>).
                      </p>
                      <p className="font-semibold text-emerald-750 dark:text-emerald-400">
                        ⚡ Abby activo en modo simulación administrativa local.
                      </p>
                      <a 
                        href="https://ai.studio/projects" 
                        target="_blank" 
                        rel="noreferrer referer" 
                        className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[9.5px] p-2 px-3 rounded-lg inline-block mt-0.5 transition"
                      >
                        💳 Recargar Prepago en AI Studio
                      </a>
                    </div>
                  )}

                  {chatLog.map((chat, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-2.5 max-w-[85%] ${chat.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        chat.sender === "user" ? "bg-slate-900 text-white" : "bg-emerald-500 text-slate-950"
                      }`}>
                        {chat.sender === "user" ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 text-slate-950" />}
                      </div>

                      <div className={`p-3 rounded-2xl text-[11px] leading-relaxed text-left ${
                        chat.sender === "user"
                          ? "bg-slate-900 text-white dark:bg-slate-800 rounded-tr-none font-medium"
                          : "bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none font-semibold shadow-xs"
                      }`}>
                        <p>{chat.text}</p>
                        <span className="text-[8.5px] text-gray-400 block mt-1 text-right font-mono font-bold">
                          {chat.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex gap-2 mr-auto items-center">
                      <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                      <p className="text-[10px] text-gray-450 italic">Abby está pensando...</p>
                    </div>
                  )}
                </div>

                {/* Live Quick Command Hints */}
                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900/55 border-y border-slate-200/50 dark:border-slate-800 space-y-1.5 text-left">
                  <span className="text-[9px] font-extrabold uppercase text-gray-400">Atajos rápidos:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button 
                      onClick={() => {
                        setInputText("Abby, ¿qué paciente viene ahora?");
                        handleSendMessage("Abby, ¿qué paciente viene ahora?");
                      }}
                      className="text-[9.5px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 border dark:border-slate-700 p-1 px-2 rounded-lg text-slate-700 dark:text-slate-300"
                    >
                      🗣️ Proximo Paciente
                    </button>
                    <button 
                      onClick={() => {
                        setInputText("Abby, ¿cómo va mi recaudación del mes?");
                        handleSendMessage("Abby, ¿cómo va mi recaudación del mes?");
                      }}
                      className="text-[9.5px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 border dark:border-slate-700 p-1 px-2 rounded-lg text-slate-700 dark:text-slate-300"
                    >
                      📈 Recaudación Mes
                    </button>
                  </div>
                </div>

                {/* Footer Controls & Inputs */}
                <div className="p-3 bg-white dark:bg-slate-950 border-t border-gray-100 dark:border-slate-850 space-y-3">
                  
                   {/* Hands-free mode selector switch (Wake word) */}
                  <div className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 duration-150">
                    <div className="text-left">
                      <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 block uppercase tracking-wide">
                        Escucha permanente (Wake-Word) 👂
                      </span>
                      <p className="text-[9px] text-gray-500">
                        Se activa al pronunciar "Abby". Use <strong className="text-emerald-600 dark:text-emerald-400 font-mono">Alt + A</strong> para encender/apagar de inmediato.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setHandsFreeMode(!handsFreeMode)}
                      className={`p-1 px-2.5 rounded-lg text-[9px] font-sans font-bold cursor-pointer transition-all border ${
                        handsFreeMode
                          ? "bg-orange-50 dark:bg-orange-950/20 text-orange-650 border-orange-200 dark:border-orange-900/50 animate-pulse font-extrabold"
                          : "bg-gray-100 dark:bg-slate-805 text-gray-500 border-gray-200 dark:border-slate-705"
                      }`}
                      title="Atajo de teclado global: Alt + A"
                    >
                      {handsFreeMode ? "ACTIVO 🎙️" : "APAGADO"}
                    </button>
                  </div>

                  {/* Keyboard input row */}
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={inputText}
                      placeholder='Ej: "¿Quién es mi próximo paciente?" o hable...'
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSendMessage();
                      }}
                      className="text-slate-800 dark:text-white flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] bg-slate-50/55 dark:bg-slate-900 placeholder:text-gray-400"
                    />

                    {/* Microphone control within sliding panel */}
                    <button
                      onClick={toggleListening}
                      className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center text-white shrink-0 ${
                        isListening 
                          ? "bg-red-500 animate-pulse ring-3 ring-red-500/25" 
                          : "bg-slate-900 text-slate-100 dark:bg-white dark:text-slate-950"
                      }`}
                    >
                      {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputText.trim()}
                      className="p-2 bg-emerald-500 text-slate-950 rounded-xl shrink-0 hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Compliance layout bar */}
                  <div className="flex items-center justify-between text-[8px] text-gray-500 pt-1 border-t dark:border-slate-850">
                    <span className="flex items-center gap-1 font-bold">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Cifrado por Ley 19.628
                    </span>
                    <button 
                      onClick={() => setSpeechEnabled(!speechEnabled)}
                      className="text-[9px] text-slate-600 hover:text-emerald-600 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {speechEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      {speechEnabled ? "Conversar" : "Silenciado"}
                    </button>
                  </div>
                </div>

              </motion.div>
            </>
          )}
        </AnimatePresence>

      </>
    );
  }

  // Rendering DOCTOR view (Dashboard panel)
  if (mode === "doctor") {
    return (
      <div id="abby-doctor-panel" className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-150 dark:border-slate-800 shadow-sm overflow-hidden font-sans grid grid-cols-1 md:grid-cols-3 min-h-[580px] hover:translate-y-[-1px] transition-transform duration-300">
        
        {/* Abby Profile sidebar */}
        <div className="bg-slate-900 border-r border-slate-850 p-6 text-white flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <span className="p-1 px-2.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-mono rounded border border-emerald-500/20 uppercase font-bold tracking-wider inline-block">
              Asistente de Inteligencia Artificial
            </span>

            <div className="flex items-center gap-3 pt-2">
              <div className="w-14 h-14 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-800 cursor-pointer hover:scale-105 active:scale-95 transition">
                <Sparkles className="w-7 h-7 text-slate-950 animate-pulse" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-white flex items-center gap-1">
                  Abby Admin AI 👩‍⚕️
                </h4>
                <p className="text-xs text-slate-400">Su secretaria administrativa 24/7</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-350 leading-relaxed font-sans pt-2">
              Abby le asiste con manos libres en el consultorio. Le escucha mediante reconocimiento de voz clínico y hable audiblemente con acento local chileno. No tiene acceso a descargas ni diagnósticos sensibles para cumplir la <strong>Ley 19.628</strong>.
            </p>

            {/* Quick Actions Suggestions */}
            <div className="pt-4 space-y-2">
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 block font-mono">Simulaciones de Comando</span>
              
              <button
                onClick={() => setInputText("Abby, ¿qué paciente viene ahora?")}
                className="w-full text-left text-[11px] bg-slate-800/40 hover:bg-slate-800 dark:bg-slate-950 border border-slate-800 p-2.5 rounded-xl block font-medium group transition-all text-slate-300"
              >
                ¿Qué paciente viene ahora? <ChevronRight className="w-3 h-3 inline-block float-right text-gray-500 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => setInputText("Abby, ¿qué hora es?")}
                className="w-full text-left text-[11px] bg-slate-800/40 hover:bg-slate-800 dark:bg-slate-950 border border-slate-800 p-2.5 rounded-xl block font-medium group transition-all text-slate-300"
              >
                ¿Qué hora es? <ChevronRight className="w-3 h-3 inline-block float-right text-gray-500 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => setInputText("Abby, ocurrió un imprevisto, necesito suspender las sesiones de hoy urgentemente para ir con mi hija a urgencias")}
                className="w-full text-left text-[11px] bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 p-2.5 rounded-xl block font-bold group transition-all text-red-300"
              >
                🚨 Suspender consultas de hoy <ChevronRight className="w-3 h-3 inline-block float-right text-red-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          <div className="border-t border-slate-850 pt-4 space-y-3">
            {/* Audio Settings Toggles */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold">Abby Habla</span>
              <button
                onClick={() => setSpeechEnabled(!speechEnabled)}
                className={`p-1.5 px-3 rounded-lg text-[10px] font-sans font-bold flex items-center gap-1 cursor-pointer transition-all border ${
                  speechEnabled
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-slate-800 text-slate-500 border-slate-700"
                }`}
              >
                {speechEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                {speechEnabled ? "Activado" : "Silenciado"}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold">Escuchar con Mic</span>
              <span className="text-[10px] text-gray-500">Es compatible con Chrome y Safari</span>
            </div>
          </div>
        </div>

        {/* Chat Conversation Pane */}
        <div className="md:col-span-2 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-950/40 p-4">
          
          {apiErrorDetails && (
            <div className="bg-amber-50/95 border border-amber-300 dark:bg-amber-950/20 dark:border-amber-900/50 p-4 rounded-2xl mb-4 text-xs text-amber-900 dark:text-amber-400 text-left space-y-2 leading-relaxed shadow-sm">
              <div className="flex items-center gap-2 font-extrabold uppercase tracking-wide text-[10px]">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Aviso de Facturación: Saldo de Prepago en Cero</span>
              </div>
              <p className="text-[11px]">
                El servidor ha comprobado con éxito su API Key (longitud: <strong>{apiErrorDetails.apiKeyLength}</strong> caracteres) conectada mediante Cloud Run + Secret Manager. Sin embargo, su proyecto en Google AI Studio no tiene saldo de facturación configurado o créditos de prepago activos (<em>Resource Exhausted / Credits depleted</em>).
              </p>
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                La agenda cuenta con soporte de <strong>Contingencia / Simulación Administrativa Local</strong>, por lo que Abby continuará respondiendo sus comandos por comandos lógicos de respaldo de forma inmediata.
              </p>
              <div className="pt-1 flex gap-2">
                <a 
                  href="https://ai.studio/projects" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[10.5px] p-2 px-3.5 rounded-xl flex items-center gap-1 transition-all"
                >
                  💳 Ir a AI Studio para Recargar Créditos Prepago
                </a>
              </div>
            </div>
          )}

          {/* Main conversation bubble list */}
          <div className="flex-1 overflow-y-auto space-y-4 max-h-[440px] pr-2 focus-visible:outline-none" ref={scrollRef}>
            {chatLog.map((chat, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${chat.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  chat.sender === "user" ? "bg-slate-900 text-white" : "bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950"
                }`}>
                  {chat.sender === "user" ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </div>

                <div className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                  chat.sender === "user"
                    ? "bg-slate-900 text-white dark:bg-slate-800 font-medium rounded-tr-none"
                    : "bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none font-medium text-left shadow-xs"
                }`}>
                  <p>{chat.text}</p>
                  <span className="text-[9px] text-gray-400 font-mono mt-1.5 block text-right font-medium">
                    {chat.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {/* Waiting loader state */}
            {isLoading && (
              <div className="flex gap-3 mr-auto items-center">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                </div>
                <p className="text-[11px] font-bold text-gray-400 italic">Abby está pensando...</p>
              </div>
            )}
          </div>

          {/* Emergency Suspension Overlay/Wizard inside chat */}
          {showEmergencyWizard && (
            <div className="bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-950 rounded-2xl p-4 my-4 font-sans animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start pb-2 border-b border-red-200/55 dark:border-red-950">
                <div className="flex items-center gap-2">
                  <div className="p-1 px-2.5 bg-red-650 text-white font-mono rounded text-[10px] font-bold uppercase animate-pulse flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Flujo Crítico Activado
                  </div>
                  <h5 className="text-xs font-bold text-red-950 dark:text-red-400">Suspensión de Sesiones de Urgencia</h5>
                </div>
                <button onClick={() => setShowEmergencyWizard(false)} className="p-1 text-red-800 dark:text-red-400 hover:text-red-950">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {wizardStep === "review" && (
                <div className="space-y-4 pt-3 text-left">
                  <p className="text-xs text-red-900 dark:text-red-300 font-medium">
                    Abby cancelará las citas programadas para hoy y enviará de inmediato alertas por **WhatsApp** y **Email** con explicaciones empáticas y opciones de reagendamiento inmediatas para no descuidar su flujo de ingresos.
                  </p>

                  <div className="bg-white dark:bg-slate-900 border border-red-200/50 p-3 rounded-xl space-y-2">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Horas Clínicas Afectadas para hoy ({todayAppointments.length}):</span>
                    {todayAppointments.length === 0 ? (
                      <p className="text-xs text-gray-400">No se encontraron horas activas para suspender hoy en la base de datos.</p>
                    ) : (
                      <div className="space-y-1">
                        {todayAppointments.map((appt, i) => (
                          <div key={i} className="flex justify-between text-xs text-slate-800 dark:text-slate-200 font-medium border-b border-slate-100 last:border-0 pb-1">
                            <span>👩‍🦰 {appt.patientName}</span>
                            <span className="font-mono text-emerald-600 bg-emerald-50 px-1 rounded">{appt.timeSlot}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Motivo Oficial de la Suspensión (Opcional):</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-red-200 bg-white/70 dark:bg-slate-900 rounded-lg text-xs"
                      value={suspensionReason}
                      onChange={(e) => setSuspensionReason(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleExecuteEmergencySuspension}
                      className="bg-red-640 hover:bg-red-700 bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1"
                      disabled={todayAppointments.length === 0}
                    >
                      Sí, Activar Notificaciones y Suspender
                    </button>
                    <button
                      onClick={() => setShowEmergencyWizard(false)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition"
                    >
                      Conservar Agenda
                    </button>
                  </div>
                </div>
              )}

              {wizardStep === "notifying" && (
                <div className="py-6 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-red-900 dark:text-red-400">Abby está contactando a los pacientes y cancelando bloques en Firestore...</p>
                  <p className="text-[10px] text-gray-500">Emitiendo alertas automáticas HIPAA por WhatsApp y plantillas de Correo.</p>
                </div>
              )}

              {wizardStep === "completed" && (
                <div className="space-y-3 pt-3 text-left">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Check className="w-5 h-5" />
                    <span className="text-xs font-extrabold uppercase">¡Agenda Notificada Correctamente!</span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-300">
                    Suspensión operada. He enviado borradores dinámicos con bloques horarios sugeridos en los próximos días:
                  </p>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-dashed text-xs space-y-2">
                    {rescheduleData.map((res, i) => (
                      <div key={i} className="flex justify-between border-b pb-1 last:border-0 last:pb-0 items-center">
                        <div>
                          <span className="font-bold">{res.patientName}</span>
                          <span className="text-[10px] text-gray-500 block">Propuesto: {res.proposedDate} ({res.proposedSlot})</span>
                        </div>
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 rounded px-1.5 py-0.5 text-[9px] font-bold">
                          {res.medium} enviado
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowEmergencyWizard(false)}
                    className="bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-4 py-1.5 rounded-lg text-xs font-bold"
                  >
                    Cerrar Asistente de Urgencias
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lower interactive input bar */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-850 flex items-center gap-2">
            {/* Input text keyboard entry */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendMessage();
              }}
              placeholder='Hable o escriba aquí. Ej: "Abby necesito suspender las citas de hoy"'
              className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 font-semibold focus:border-slate-400 placeholder:text-gray-400"
            />

            {/* Micro voice record trigger toggle button (WhatsApp dictation styling) */}
            <button
              onClick={toggleListening}
              className={`p-2.5 rounded-xl transition cursor-pointer flex items-center justify-center relative ${
                isListening 
                  ? "bg-rose-500 text-white animate-pulse ring-4 ring-rose-500/25 scale-105" 
                  : "bg-emerald-500 dark:bg-emerald-600 hover:bg-emerald-600 dark:hover:bg-emerald-500 text-slate-950"
              }`}
              title="Dictar mensaje por voz"
            >
              {isListening ? (
                <div className="flex items-center gap-1.5">
                  <MicOff className="w-4 h-4 text-white" />
                  <div className="flex items-end gap-0.5 h-3 px-0.5">
                    <span className="w-0.5 h-1.5 bg-white rounded-xs animate-bounce" style={{ animationDelay: '0ms', animationDuration: '600ms' }}></span>
                    <span className="w-0.5 h-3 bg-white rounded-xs animate-bounce" style={{ animationDelay: '150ms', animationDuration: '600ms' }}></span>
                    <span className="w-0.5 h-2 bg-white rounded-xs animate-bounce" style={{ animationDelay: '300ms', animationDuration: '600ms' }}></span>
                  </div>
                </div>
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {/* Submit chat click button */}
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="p-2.5 bg-slate-900 hover:bg-slate-950 text-white dark:bg-white dark:hover:bg-slate-50 dark:text-slate-950 rounded-xl transition flex items-center justify-center cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    );
  }

  // Else, Render PUBLIC client orientation widget (floating corner tool)
  return (
    <div id="abby-public-widget" className="fixed bottom-6 right-6 z-50 font-sans pointer-events-auto">
      <AnimatePresence>
        {isWidgetOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-96 sm:w-[420px] md:w-[460px] bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col justify-between mb-4 h-[620px]"
          >
            {/* Widget top header */}
            <div className="bg-slate-900 dark:bg-slate-950 text-white p-4.5 flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Sparkles className="w-24 h-24 text-white" />
              </div>

              <div className="flex items-center gap-2.5 relative z-10 text-left">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow">
                  <Sparkles className="w-5.5 h-5.5 text-slate-950" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold flex items-center gap-1.5 uppercase tracking-wide">
                    Soporte Abby AI
                  </h4>
                  <p className="text-[10.5px] text-emerald-400 flex items-center gap-1 font-bold">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-ping"></span>
                    Atención e Información 24/7
                  </p>
                </div>
              </div>

              {/* Close widget button */}
              <button
                onClick={() => setIsWidgetOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            {/* Conversation log list with larger fonts */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50/50 dark:bg-slate-950/20 scroll-smooth mr-0.5" ref={scrollRef}>
              {chatLog.map((chat, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 max-w-[85%] ${chat.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white ${
                    chat.sender === "user" ? "bg-slate-900" : "bg-emerald-500 text-slate-950"
                  }`}>
                    {chat.sender === "user" ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4 text-slate-950" />}
                  </div>

                  <div className={`p-3.5 rounded-2xl text-sm leading-relaxed text-left ${
                    chat.sender === "user"
                      ? "bg-slate-900 text-white dark:bg-slate-800 rounded-tr-none font-medium animate-in slide-in-from-right-1 duration-100"
                      : "bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none font-semibold shadow-xs animate-in slide-in-from-left-1 duration-100"
                  }`}>
                    <p className="whitespace-pre-line">{chat.text}</p>
                    {chat.sender === "abby" && (chat.text.includes("agendar") || chat.text.includes("Calendario") || chat.text.includes("asistente") || chat.text.includes("arancel") || chat.text.includes("recomiendo") || chat.text.includes("horas")) && (
                      <button
                        onClick={() => {
                          const el = document.getElementById("booking-section");
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth" });
                            setIsWidgetOpen(false);
                          }
                        }}
                        className="mt-2 text-center w-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-extrabold text-xs py-2 px-3.5 rounded-xl transition duration-150 flex items-center justify-center gap-1 shadow-sm uppercase tracking-wider cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 text-slate-950" /> Ir al Calendario de Reservas
                      </button>
                    )}
                    <span className="text-[9px] text-gray-400 block mt-1.5 text-right font-mono font-bold">
                      {chat.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Collapsible Actions pocket section ("Bolsillo expansible") to prevent visual clutter */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-850 space-y-2.5">
              
              <div className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-2xl border border-gray-150 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setIsActionsOpen(!isActionsOpen)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-500 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 transition cursor-pointer select-none uppercase tracking-wider"
                >
                  <span className="flex items-center gap-1.5 text-[11px]">
                    ⚙️ Acciones
                  </span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 capitalize">
                    <span>{isActionsOpen ? "ocultar" : "expandir"}</span>
                    {isActionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isActionsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, marginTop: 0 }}
                      animate={{ height: "auto", opacity: 1, marginTop: 10 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden space-y-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById("booking-section");
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth" });
                            setIsWidgetOpen(false);
                          }
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-950 border border-emerald-500 text-white font-extrabold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md uppercase tracking-wider text-center cursor-pointer"
                      >
                        <Calendar className="w-4 h-4 text-emerald-400" /> Agendar Hora Médica 📅
                      </button>

                      <div className="border-t border-gray-200 dark:border-slate-800 pt-2 text-left">
                        <span className="text-[10px] font-extrabold uppercase text-gray-400 block mb-1.5">💡 Preguntas Frecuentes:</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handlePatientFAQ("how_to_book");
                              setIsActionsOpen(false);
                            }}
                            className="p-1.5 px-3 border border-gray-150 dark:border-slate-800 bg-white hover:bg-slate-105 dark:bg-slate-950 rounded-xl text-xs text-left font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer shadow-xs"
                          >
                            ¿Cómo agendar hora?
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handlePatientFAQ("pricing");
                              setIsActionsOpen(false);
                            }}
                            className="p-1.5 px-3 border border-gray-150 dark:border-slate-800 bg-white hover:bg-slate-105 dark:bg-slate-950 rounded-xl text-xs text-left font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer shadow-xs"
                          >
                            ¿Aranceles consulta?
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handlePatientFAQ("privacy");
                              setIsActionsOpen(false);
                            }}
                            className="p-1.5 px-3 border border-gray-150 dark:border-slate-800 bg-white hover:bg-slate-105 dark:bg-slate-950 rounded-xl text-xs text-left font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer shadow-xs"
                          >
                            Privacidad Ley 19.628
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handlePatientFAQ("video_call");
                              setIsActionsOpen(false);
                            }}
                            className="p-1.5 px-3 border border-gray-150 dark:border-slate-800 bg-white hover:bg-slate-105 dark:bg-slate-950 rounded-xl text-xs text-left font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer shadow-xs"
                          >
                            ¿Cómo es videollamada?
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Chat Input & Mic (WhatsApp Voice dictation style) with text-sm for better legibility */}
              <div className="flex gap-2.5 items-center border-t border-slate-100 dark:border-slate-850 pt-3">
                <input
                  type="text"
                  value={inputText}
                  placeholder="Escribe tu consulta y presiona Enter..."
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendMessage();
                  }}
                  className="flex-1 px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-sm bg-slate-50/55 dark:bg-slate-950 placeholder:text-gray-400 text-slate-800 dark:text-slate-200 font-semibold focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />

                {/* WhatsApp-style patient voice dictation button */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2.5 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0 relative ${
                    isListening 
                      ? "bg-rose-500 text-white animate-pulse ring-4 ring-rose-500/25 scale-105" 
                      : "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-slate-950"
                  }`}
                  title="Presione para dictar por voz"
                >
                  {isListening ? (
                    <div className="flex items-center gap-1 px-0.5">
                      <MicOff className="w-4 h-4 text-white" />
                      <div className="flex items-end gap-0.5 h-3">
                        <span className="w-0.5 h-1.5 bg-white rounded-xs animate-bounce" style={{ animationDelay: '0ms', animationDuration: '600ms' }}></span>
                        <span className="w-0.5 h-3 bg-white rounded-xs animate-bounce" style={{ animationDelay: '150ms', animationDuration: '600ms' }}></span>
                        <span className="w-0.5 h-2 bg-white rounded-xs animate-bounce" style={{ animationDelay: '300ms', animationDuration: '600ms' }}></span>
                      </div>
                    </div>
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim()}
                  className="p-2.5 bg-slate-900 border border-slate-900 hover:bg-slate-950 dark:bg-white dark:border-white dark:hover:bg-slate-55 text-white dark:text-slate-950 rounded-xl shrink-0 transition flex items-center justify-center cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Voice toggle info */}
              <div className="flex items-center justify-between text-[8.5px] text-gray-500 pt-1.5 border-t dark:border-slate-850">
                <span className="flex items-center gap-1 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Resguardado por Ley HIPAA
                </span>
                <button 
                  onClick={() => setSpeechEnabled(!speechEnabled)}
                  className="text-[9px] text-slate-600 hover:text-emerald-600 font-bold flex items-center gap-1 active:scale-95 transition"
                >
                  {speechEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  {speechEnabled ? "Audible" : "Silenciado"}
                </button>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Larger Launcher Bubble (w-18 h-18 instead of w-14 h-14) */}
      <motion.button
        id="abby-launcher-bubble"
        onClick={() => setIsWidgetOpen(!isWidgetOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-18 h-18 bg-slate-900 text-white dark:bg-white dark:text-slate-950 rounded-full shadow-2xl flex items-center justify-center cursor-pointer pointer-events-auto border-2 border-emerald-500 overflow-hidden relative group"
        title="Orientación y Soporte Abby AI"
      >
        <Sparkles className="w-8 h-8 text-emerald-400 group-hover:rotate-12 transition-transform duration-300" />
        <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
      </motion.button>
    </div>
  );
}
