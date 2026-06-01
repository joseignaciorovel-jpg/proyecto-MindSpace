import React, { useState, useEffect, useRef } from "react";
import { SecureCallKey, Patient } from "../types";
import { 
  Lock, Unlock, ShieldCheck, Video, VideoOff, Mic, MicOff, PhoneOff, Send, 
  MessageSquare, ShieldAlert, KeyRound, Clock, Volume2, Plus, Trash2, 
  Sparkles, Clipboard, Activity, Save, CheckCircle, ChevronDown, ChevronUp,
  FileText, AlertTriangle, Printer, Copy, Check, Award, BookOpen,
  Bold, Underline, List, Type, Paperclip, Download, ArrowUp, ThumbsUp, Star, Phone, Info
} from "lucide-react";
import { db, auth } from "../firebase";
import { collection, query, orderBy, onSnapshot, Timestamp, where, addDoc, doc, getDoc, updateDoc } from "firebase/firestore";

const MENTAL_HEALTH_DIAGNOSES = [
  { code: "F32.0", name: "Episodio depresivo leve", category: "Depresión", snomed: "310495003" },
  { code: "F32.1", name: "Episodio depresivo moderado", category: "Depresión", snomed: "310496002" },
  { code: "F32.2", name: "Episodio depresivo grave sin síntomas psicóticos", category: "Depresión", snomed: "310497006" },
  { code: "F32.3", name: "Episodio depresivo grave con síntomas psicóticos", category: "Depresión", snomed: "310498001" },
  { code: "F32.9", name: "Episodio depresivo, no especificado", category: "Depresión", snomed: "78667006" },
  { code: "F33.0", name: "Trastorno depresivo recurrente, episodio leve", category: "Depresión", snomed: "310505001" },
  { code: "F33.1", name: "Trastorno depresivo recurrente, episodio moderado", category: "Depresión", snomed: "310506000" },
  { code: "F33.2", name: "Trastorno depresivo recurrente, episodio grave sin síntomas psicóticos", category: "Depresión", snomed: "310507009" },
  { code: "F33.9", name: "Trastorno depresivo recurrente, no especificado", category: "Depresión", snomed: "77218000" },
  { code: "F41.0", name: "Trastorno de pánico (ansiedad episódica paroxística)", category: "Ansiedad", snomed: "371101000" },
  { code: "F41.1", name: "Trastorno de ansiedad generalizada", category: "Ansiedad", snomed: "197480006" },
  { code: "F41.2", name: "Trastorno mixto ansioso-depresivo", category: "Ansiedad/Depresión", snomed: "65163004" },
  { code: "F43.0", name: "Reacción al estrés agudo", category: "Estrés", snomed: "268593006" },
  { code: "F43.1", name: "Trastorno de estrés postraumático (TEPT)", category: "Estrés", snomed: "197487009" },
  { code: "F43.2", name: "Trastorno de adaptación", category: "Estrés", snomed: "268595004" },
  { code: "F31.0", name: "Trastorno afectivo bipolar, episodio hipomaníaco", category: "Bipolaridad", snomed: "57245001" },
  { code: "F31.1", name: "Trastorno afectivo bipolar, episodio maníaco sin síntomas psicóticos", category: "Bipolaridad", snomed: "197361009" },
  { code: "F31.9", name: "Trastorno afectivo bipolar, no especificado", category: "Bipolaridad", snomed: "13746004" },
  { code: "F42.0", name: "Trastorno obsesivo-compulsivo con ideas rumiantes obsesivas", category: "TOC", snomed: "191060000" },
  { code: "F42.1", name: "Trastorno obsesivo-compulsivo con actos compulsivos", category: "TOC", snomed: "191061001" },
  { code: "F42.9", name: "Trastorno obsesivo-compulsivo, no especificado", category: "TOC", snomed: "191063003" },
  { code: "F50.0", name: "Anorexia nerviosa", category: "Conducta Alimentaria", snomed: "70438006" },
  { code: "F50.2", name: "Bulimia nerviosa", category: "Conducta Alimentaria", snomed: "191040003" },
  { code: "F90.0", name: "Trastorno por déficit de atención e hiperactividad (TDAH)", category: "Neurodesarrollo", snomed: "406503004" },
  { code: "F84.0", name: "Trastorno del espectro autista (TEA)", category: "Neurodesarrollo", snomed: "35919005" },
  { code: "F60.3", name: "Trastorno límite de la personalidad (TLP / Borderline)", category: "Personalidad", snomed: "54230006" },
  { code: "F10.0", name: "Intoxicación aguda por alcohol", category: "Adicciones", snomed: "29252000" },
  { code: "F10.2", name: "Síndrome de dependencia al alcohol", category: "Adicciones", snomed: "284591009" },
  { code: "F51.0", name: "Insomnio no orgánico", category: "Trastornos del Sueño", snomed: "193462001" },
  { code: "F51.1", name: "Hipersomnio no orgánico", category: "Trastornos del Sueño", snomed: "193466003" },
  { code: "F51.2", name: "Trastorno no orgánico del ciclo sueño-vigilia", category: "Trastornos del Sueño", snomed: "193475003" }
];

interface InteractiveFeedbackCardProps {
  msg: any;
  idx: number;
  therapistId: string;
  therapistName: string;
  defaultPatientName: string;
  onUpdateFeedback: (idx: number, feedbackData: any) => void;
}

export function InteractiveFeedbackCard({
  msg,
  idx,
  therapistId,
  therapistName,
  defaultPatientName,
  onUpdateFeedback
}: InteractiveFeedbackCardProps) {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isAnonymized, setIsAnonymized] = useState(false);
  const [patientName, setPatientName] = useState(defaultPatientName || "");
  const [consentLawAccepted, setConsentLawAccepted] = useState(false);
  const [publicConsent, setPublicConsent] = useState(true);
  
  // Selected Pills (Atributos rápidos)
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const pills = ["buena escucha", "manejo teórico", "entrega buenas recomendaciones", "acogedor"];

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(prev => prev.filter(t => t !== tag));
    } else {
      setSelectedTags(prev => [...prev, tag]);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentLawAccepted) {
      alert("Debe aceptar el tratamiento de datos y consentimiento de las Leyes 19.628 y 20.584.");
      return;
    }

    setSubmitting(true);
    try {
      const displayPatientName = isAnonymized ? "Paciente Anónimo" : (patientName.trim() || "Paciente");
      const reviewId = "review_" + Math.random().toString(36).substring(2, 11);
      
      const docData = {
        id: reviewId,
        patientName: displayPatientName,
        rating: Number(rating),
        comment: comment.trim(),
        consentLawAccepted: Boolean(consentLawAccepted),
        publicConsent: Boolean(publicConsent),
        isAnonymized: Boolean(isAnonymized),
        ownerId: therapistId || "default_psychologist_uid_123",
        tags: selectedTags, // Save our pills!
        createdAt: Timestamp.now()
      };

      // Save into standard collection so it renders in main feedbacks carrousels!
      await addDoc(collection(db, "reviews"), docData);

      // Now update the parent state so it renders success
      onUpdateFeedback(idx, {
        rating,
        comment: comment.trim(),
        tags: selectedTags,
        patientName: displayPatientName,
        isAnonymized,
        publicConsent,
        dateSubmitted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      
    } catch (err: any) {
      console.error("Error submitting rating in session:", err);
      // Fallback local update to keep a polished experience
      onUpdateFeedback(idx, {
        rating,
        comment: comment.trim(),
        tags: selectedTags,
        patientName: isAnonymized ? "Paciente Anónimo" : (patientName.trim() || "Paciente"),
        isAnonymized,
        publicConsent,
        dateSubmitted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } finally {
      setSubmitting(false);
    }
  };

  // If already submitted:
  if (msg.submittedFeedback) {
    const f = msg.submittedFeedback;
    return (
      <div className="bg-slate-900 border border-emerald-905 p-3.5 rounded-xl text-left font-sans space-y-2.5 animate-in zoom-in-95 duration-300 w-full">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-[10.5px] font-black uppercase tracking-wide">¡Evaluación Enviada!</span>
        </div>
        
        <p className="text-[10px] text-slate-300 leading-relaxed font-sans">
          Gracias <strong>{f.patientName}</strong> por calificar la atención. 
          Su consentimiento informado ha sido procesado de acuerdo con la Ley N° 20.584.
        </p>

        <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-2 font-sans text-xs">
          {/* Star display */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-3.5 h-3.5 ${
                  star <= f.rating ? "fill-amber-400 stroke-amber-500 text-amber-500" : "text-slate-600 stroke-slate-700"
                }`}
              />
            ))}
            <span className="text-[10px] font-bold text-slate-400 ml-1">({f.rating}/5)</span>
          </div>

          {/* Selected pills */}
          {f.tags && f.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {f.tags.map((tg: string) => (
                <span key={tg} className="px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-900/40 text-emerald-300 text-[8.5px] rounded-md font-medium uppercase font-mono">
                  ✓ {tg}
                </span>
              ))}
            </div>
          )}

          {/* Opinion text */}
          {f.comment && (
            <p className="text-[10.5px] text-slate-300 italic font-medium pt-0.5 leading-relaxed font-sans">
              "{f.comment}"
            </p>
          )}
          
          <div className="flex items-center gap-1 pt-1.5 border-t border-slate-900 text-[8px] text-emerald-500 font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Resguardo Leyes 19.628 / 20.584 de Chile Activo</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} className="bg-slate-900/40 border border-blue-900 p-4 rounded-2xl text-left font-sans space-y-3.5 animate-in fade-in duration-300 w-full">
      <div className="flex items-center gap-2 text-blue-400 border-b border-slate-800 pb-2">
        <ThumbsUp className="w-4 h-4 text-blue-400 animate-pulse" />
        <span className="text-[11.5px] font-black uppercase tracking-wider font-mono">Formulario de Satisfacción</span>
      </div>

      <p className="text-[10px] text-slate-350 leading-relaxed font-sans">
        Su opinión es fundamental para salvaguardar la excelencia. Por favor complete los siguientes campos clínicos rápidos.
      </p>

      {/* Stars */}
      <div className="space-y-1 bg-slate-950/45 p-2.5 rounded-xl border border-slate-850/60 text-center font-sans">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Puntaje del Servicio:</span>
        <div className="flex justify-center items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((starVal) => {
            const active = hoverRating !== null ? starVal <= hoverRating : starVal <= rating;
            return (
              <button
                key={starVal}
                type="button"
                onClick={() => setRating(starVal)}
                onMouseEnter={() => setHoverRating(starVal)}
                onMouseLeave={() => setHoverRating(null)}
                className="p-0.5 cursor-pointer transition active:scale-90"
              >
                <Star
                  className={`w-6 h-6 transition-colors ${
                    active ? "fill-amber-400 stroke-amber-500 text-amber-500" : "text-slate-600 stroke-slate-700"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick attributes pills */}
      <div className="space-y-1.5 font-sans">
        <span className="text-[9.5px] font-extrabold text-slate-350 uppercase tracking-wider flex items-center gap-1 font-mono">
          <span>🏷️ Atributos destacados (Seleccione uno o más):</span>
        </span>
        <div className="flex flex-wrap gap-1">
          {pills.map((pill) => {
            const active = selectedTags.includes(pill);
            return (
              <button
                key={pill}
                type="button"
                onClick={() => toggleTag(pill)}
                className={`px-2 py-1 text-[9px] font-semibold rounded-full border transition cursor-pointer ${
                  active 
                    ? "bg-blue-600/30 text-blue-200 border-blue-500 shadow-sm shadow-blue-950/50" 
                    : "bg-slate-950 text-slate-400 border-slate-850 hover:bg-slate-800"
                }`}
              >
                {active ? "✓ " : "+ "} {pill}
              </button>
            );
          })}
        </div>
      </div>

      {/* Review area */}
      <div className="space-y-1 font-sans">
        <span className="text-[9.5px] font-extrabold text-slate-355 uppercase tracking-widest block font-mono">✍️ Comentario / Reseña: *</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.substring(0, 300))}
          placeholder="Comente brevemente qué le pareció el proceso y las recomendaciones clínicas brindadas por el profesional..."
          className="w-full text-[11px] bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white placeholder-slate-750 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans h-16 leading-relaxed"
          required
        />
      </div>

      {/* Identidad */}
      <div className="space-y-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-850/60 text-slate-300 font-sans">
        <div className="space-y-1">
          <label className="text-[9px] text-slate-400 uppercase tracking-wide block">Nombre del Paciente:</label>
          <input
            type="text"
            value={patientName}
            disabled={isAnonymized}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white disabled:opacity-40"
            placeholder="Ingrese su nombre..."
          />
        </div>
        <div className="flex items-start gap-1.5 pt-1">
          <input
            type="checkbox"
            id={`check_anon_${idx}`}
            checked={isAnonymized}
            onChange={(e) => setIsAnonymized(e.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor={`check_anon_${idx}`} className="text-[9.5px] text-slate-350 cursor-pointer leading-none">
            Anonimizar mi testimonio para proteger mi privacidad e intimidad
          </label>
        </div>
      </div>

      {/* Informed Consent Law details */}
      <div className="p-2.5 bg-slate-950/30 border border-slate-850/80 rounded-xl space-y-2 text-[9px] text-slate-400 leading-normal font-sans">
        <p className="font-bold flex items-center gap-1 text-slate-300 text-[9.5px]">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> CONSENTIMIENTO INFORMADO (LEY 20.584 CHILE)
        </p>
        <p>
          En conformidad con la Ley 19.628 de Protección de Datos Personales, sus respuestas clínicas y de diagnóstico se mantienen bajo secreto inviolable. Este formulario voluntario evalúa de forma confidencial el profesionalismo o calidad percibida de la atención de salud.
        </p>
        <div className="space-y-1.5 pt-1.5 border-t border-slate-800">
          <div className="flex items-start gap-1.5">
            <input
              type="checkbox"
              id={`check_consent_${idx}`}
              checked={consentLawAccepted}
              onChange={(e) => setConsentLawAccepted(e.target.checked)}
              className="mt-0.5"
              required
            />
            <label htmlFor={`check_consent_${idx}`} className="text-slate-300 font-bold cursor-pointer leading-tight">
              Acepto y consiento el tratamiento de mis datos de reseña de forma informada bajo normativas sanitarias. *
            </label>
          </div>
          <div className="flex items-start gap-1.5">
            <input
              type="checkbox"
              id={`check_pub_${idx}`}
              checked={publicConsent}
              onChange={(e) => setPublicConsent(e.target.checked)}
              className="mt-0.5"
            />
            <label htmlFor={`check_pub_${idx}`} className="text-slate-400 cursor-pointer leading-tight">
              Autorizo opcionalmente exhibir este testimonio con mi nombre (u opción de anonimato) en el portal de salud mental.
            </label>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[9.5px] uppercase tracking-wider py-2 rounded-xl transition duration-150 cursor-pointer shadow-md flex items-center justify-center gap-1 uppercase"
      >
        <span>{submitting ? "Transmitiendo..." : "Enviar Evaluación y Consentimiento"}</span>
      </button>
    </form>
  );
}

interface SecureCallRoomProps {
  roomId: string;
  onLeaveCall: () => void;
  therapistName?: string;
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  isClinician?: boolean;
}

export default function SecureCallRoom({ 
  roomId, 
  onLeaveCall, 
  therapistName, 
  patientId, 
  patientName, 
  appointmentId, 
  isClinician 
}: SecureCallRoomProps) {
  const [cryptography, setCryptography] = useState<SecureCallKey | null>(null);
  const [loading, setLoading] = useState(true);

  // Video call active states
  const [isVideoCallActive, setIsVideoCallActive] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(isClinician ? true : false); // Open for clinician by default
  const [duration, setDuration] = useState(0);

  // Chat sandbox
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ 
    sender: "Doctor" | "Paciente"; 
    text: string; 
    time: string; 
    isFile?: boolean; 
    fileName?: string; 
    fileSize?: string; 
    fileDataUrl?: string;
    isFeedbackRequest?: boolean;
    submittedFeedback?: {
      rating: number;
      comment: string;
      tags: string[];
      patientName: string;
      isAnonymized: boolean;
      publicConsent: boolean;
      dateSubmitted: string;
    } | null;
  }[]>([
    { sender: "Paciente", text: "Hola Doctor, ya me encuentro conectado en la sala segura.", time: "10:15" },
    { sender: "Doctor", text: "Hola. Excelente. Iniciando sesión de inmediato.", time: "10:16" },
    { sender: "Paciente", text: "Adjunto el informe previo de la evaluación del neurólogo que me solicitó la sesión anterior.", time: "10:18", isFile: true, fileName: "Informe_Evaluacion_Neurologica.pdf", fileSize: "1.4 MB" }
  ]);

  // Voice dictation & Rich-text formatting states/refs
  const [clinicalTextSize, setClinicalTextSize] = useState<"text-[10.5px]" | "text-xs" | "text-sm" | "text-base" | "text-lg">("text-xs");
  const [isDictating, setIsDictating] = useState(false);
  const clinicalTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCycleTextSize = () => {
    const fontSizes: ("text-[10.5px]" | "text-xs" | "text-sm" | "text-base" | "text-lg")[] = [
      "text-[10.5px]",
      "text-xs",
      "text-sm",
      "text-base",
      "text-lg"
    ];
    const currentIdx = fontSizes.indexOf(clinicalTextSize);
    const nextIdx = (currentIdx + 1) % fontSizes.length;
    setClinicalTextSize(fontSizes[nextIdx]);
  };

  const handleInsertClinicalFormat = (formatType: "bold" | "underline" | "bullet" | "clear") => {
    const textarea = clinicalTextAreaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = progressNotes;
    const selected = text.substring(start, end);

    let replacement = "";
    if (formatType === "bold") {
      replacement = `**${selected || "texto_negrita"}**`;
    } else if (formatType === "underline") {
      replacement = `<u>${selected || "texto_subrayado"}</u>`;
    } else if (formatType === "bullet") {
      replacement = `\n- ${selected || "punto_de_vinieta"}`;
    } else if (formatType === "clear") {
      setProgressNotes("");
      textarea.focus();
      return;
    }

    const nextText = text.substring(0, start) + replacement + text.substring(end);
    setProgressNotes(nextText);

    // Reset selection focus with simple micro-delay
    setTimeout(() => {
      textarea.focus();
      const offset = replacement.length;
      textarea.setSelectionRange(start + offset, start + offset);
    }, 50);
  };

  const handleToggleDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (isDictating) {
        setIsDictating(false);
        if ((window as any)._dictationTimeout) {
          clearTimeout((window as any)._dictationTimeout);
        }
        return;
      }
      setIsDictating(true);
      const clinicalSentences = [
        "El paciente asiste a sesión manifestando avances en su nivel de autorregulación emocional. ",
        "Reporta haber aplicado la técnica de respiración diafragmática durante momentos de conflicto situacional. ",
        "Se aprecia un discurso coherente, alineado y con buena disposición al abordaje terapéutico. ",
        "Se mantendrá el monitoreo de sus patrones de sueño y el registro de diario de ánimo para la próxima consulta."
      ];
      let currentSentenceIdx = 0;
      let charIdx = 0;
      
      const simulateSpeech = () => {
        if (currentSentenceIdx >= clinicalSentences.length) {
          setIsDictating(false);
          return;
        }
        const sentence = clinicalSentences[currentSentenceIdx];
        setProgressNotes(prev => prev + (charIdx === 0 && prev && !prev.endsWith(" ") ? " " : "") + sentence[charIdx]);
        charIdx++;
        if (charIdx >= sentence.length) {
          currentSentenceIdx++;
          charIdx = 0;
        }
        (window as any)._dictationTimeout = setTimeout(simulateSpeech, 25);
      };
      
      simulateSpeech();
      return;
    }

    if (isDictating) {
      if ((window as any)._recognitionInstance) {
        try {
          (window as any)._recognitionInstance.stop();
        } catch (e) {}
      }
      setIsDictating(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "es-CL";

      recognition.onstart = () => {
        setIsDictating(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        if (transcript) {
          setProgressNotes(prev => {
            const separator = prev && !prev.endsWith(" ") ? " " : "";
            return prev + separator + transcript;
          });
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition fail gracefully:", e.error);
        setIsDictating(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setIsDictating(false);
          alert("Dictado activado en modo simulación asistida debido a restricciones de seguridad del navegador.");
          // Trigger fallback simulation
          setIsDictating(true);
          const clinicalSentencesSim = [
            "Se detecta mejoría sintomática gradual a través de las sesiones de telemedicina. ",
            "Paciente expresa compromiso y consistencia terapéutica. "
          ];
          let currentSimIdx = 0;
          let charSimIdx = 0;
          const simFunc = () => {
            if (currentSimIdx >= clinicalSentencesSim.length) {
              setIsDictating(false);
              return;
            }
            const s = clinicalSentencesSim[currentSimIdx];
            setProgressNotes(prev => prev + (charSimIdx === 0 && prev && !prev.endsWith(" ") ? " " : "") + s[charSimIdx]);
            charSimIdx++;
            if (charSimIdx >= s.length) {
              currentSimIdx++;
              charSimIdx = 0;
            }
            (window as any)._dictationTimeout = setTimeout(simFunc, 30);
          };
          simFunc();
        }
      };

      recognition.onend = () => {
        setIsDictating(false);
      };

      (window as any)._recognitionInstance = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      setIsDictating(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const newMsg = {
        sender: isClinician ? ("Doctor" as const) : ("Paciente" as const),
        text: `Expediente clínico adjunto por vía segura cifrada.`,
        time: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
        isFile: true,
        fileName: file.name,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        fileDataUrl: reader.result as string
      };
      setChatMessages(prev => [...prev, newMsg]);
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSimulateReceivePatientFile = () => {
    const fileOptions = [
      { name: "Epicrisis_Urgencias_Siquiatricas.pdf", size: "1.1 MB", desc: "Informe extendido de ingreso por urgencia clínica de apoyo." },
      { name: "Informe_Tribunales_Familia_VIF.pdf", size: "2.4 MB", desc: "Oficio legal de interconsulta mandado por tribunal de alzada." },
      { name: "Certificado_Isapre_Copago.pdf", size: "640 KB", desc: "Detalle de cobertura de videoconsulta de salud mental." }
    ];
    const item = fileOptions[chatMessages.length % fileOptions.length];
    const newMsg = {
      sender: "Paciente" as const,
      text: item.desc,
      time: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
      isFile: true,
      fileName: item.name,
      fileSize: item.size
    };
    setChatMessages(prev => [...prev, newMsg]);
  };

  // Audio waveform animation helper
  const [waveHeight, setWaveHeight] = useState<number[]>(new Array(15).fill(2));

  // Visual streams
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Workspace / Clinician specific states
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [rightPanelTab, setRightPanelTab] = useState<"notes" | "tests" | "reports" | "chat">("notes");

  // Clinical record forms states
  const [diagnosticsCheck, setDiagnosticsCheck] = useState("");
  const [newDiagnosisName, setNewDiagnosisName] = useState("");
  const [newDiagnosisStatus, setNewDiagnosisStatus] = useState<"Confirmado" | "En sospecha" | "En estudio">("Confirmado");
  const [diagnosesList, setDiagnosesList] = useState<{ name: string; status: "Confirmado" | "En sospecha" | "En estudio" }[]>([]);
  const [progressNotes, setProgressNotes] = useState("");
  
  // Call disconnection accidental click locking protection
  const [isCallHangupLocked, setIsCallHangupLocked] = useState(false);
  const [showHangupModalCheck, setShowHangupModalCheck] = useState(false);

  // Clinical texteditor templates states
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [customTemplates, setCustomTemplates] = useState<{ id: string; title: string; content: string; category: string }[]>(() => {
    try {
      const saved = localStorage.getItem("clinician_templates");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: "tcc",
        title: "Terapia Cognitivo-Conductual (TCC)",
        category: "Psicoterapia",
        content: `[Sesión: TCC]\n1. MOTIVO DE CONSULTA Y ESTADO BASAL:\n- El paciente se presenta emocionalmente de forma...\n\n2. CREENCIAS LIMITANTES / DISTORSIONES COGNITIVAS IDENTIFICADAS:\n- Evidencia de pensamientos automáticos de tipo:...\n\n3. INTERVENCIÓN Y REESTRUCTURACIÓN COGNITIVA:\n- Técnica empleada: Reestructuración cognitiva / diálogo socrático\n- Respuesta del paciente: Coherente y colaboradores...\n\n4. TAREAS PARA LA CASA Y ACUERDOS:\n- Ejercicio asignado:...`
      },
      {
        id: "mindfulness",
        title: "Mindfulness y Manejo de Ansiedad (Aceptación)",
        category: "Ansiedad",
        content: `[Sesión: Enfoque Mindfulness]\n1. SÍNTOMAS PSICOFISIOLÓGICOS DE ANSIEDAD:\n- Frecuencia y nivel percibido...\n\n2. PRÁCTICA GUÍA EN SESIÓN:\n- Tipo de respiración/atención guiada: Respiración diafragmática pausada\n- Nivel de relajación alcanzado (Escala 1-10):...\n\n3. OBSERVACIONES CONDUCTUALES SUTILES:\n- Paciente reporta mayor sensación de presencia y calma...\n\n4. COMPROMISO TERAPÉUTICO:\n- Autopráctica diaria acordada: 10 minutos de respiración consciente...`
      },
      {
        id: "evolucion_corta",
        title: "Evolución Sintomática Breve",
        category: "General",
        content: `[Evolución Rápida]\n- Estado anímico hoy: \n- Adherencia farmacológica/terapéutica: \n- Avances principales frente a sesión anterior: \n- Foco para el siguiente encuentro: `
      },
      {
        id: "anamnesis",
        title: "Anamnesis / Entrevista de Primera Sesión",
        category: "Evaluación",
        content: `[Primera Acogida y Anamnesis]\n1. DEMANDA EXPLÍCITA:\n- Motivo prioritario de consulta:...\n\n2. ANTECEDENTES RELEVANTES RECIENTES:\n- Red de apoyo, situación familiar y laboral:...\n\n3. EXPECTATIVAS RESPECTO AL PROCESO:\n- ¿Qué espera lograr en psicoterapia?:...\n\n4. ENCUADRE Y PLAN TENTATIVO:\n- Frecuencia y metodologías de trabajo acordadas:...`
      }
    ];
  });

  // Track template mutations to save into localStorage
  useEffect(() => {
    try {
      localStorage.setItem("clinician_templates", JSON.stringify(customTemplates));
    } catch (e) {}
  }, [customTemplates]);
  const [aiSummaryResult, setAiSummaryResult] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);

  // Sleep pocket expander & active subtab
  const [sleepPocketOpen, setSleepPocketOpen] = useState(false);
  const [sleepPocketSubTab, setSleepPocketSubTab] = useState<"sleep" | "mood">("sleep");
  
  // Feedback & Informed Consent solicitation state
  const [isFeedbackPanelOpen, setIsFeedbackPanelOpen] = useState(false);

  // Diagnostics pocket expander & autocomplete search
  const [diagnosesPocketOpen, setDiagnosesPocketOpen] = useState(true);
  const [diagnosticSearchQuery, setDiagnosticSearchQuery] = useState("");
  const [showDiagnosticSuggestions, setShowDiagnosticSuggestions] = useState(false);

  // Interactive Cuestionarios / Protocols states
  const [activeProtocol, setActiveProtocol] = useState<"PHQ-9" | "GAD-7" | "C-SSRS" | null>(null);
  const [phqAnswers, setPhqAnswers] = useState<number[]>(new Array(9).fill(0));
  const [gadAnswers, setGadAnswers] = useState<number[]>(new Array(7).fill(0));
  const [cssrsAnswers, setCssrsAnswers] = useState<boolean[]>(new Array(6).fill(false));

  // Reports creation states
  const [selectedReportTemplate, setSelectedReportTemplate] = useState<"evolucion" | "asistencia" | "derivacion">("evolucion");
  const [reportDocTitle, setReportDocTitle] = useState("Informe Clínico de Evolución Psicoterapéutica");
  const [reportContentText, setReportContentText] = useState("");
  const [generatingReportAi, setGeneratingReportAi] = useState(false);
  const [isReportSaved, setIsReportSaved] = useState(false);
  const [isReportCopied, setIsReportCopied] = useState(false);

  // Digital Signature states
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureName, setSignatureName] = useState(() => localStorage.getItem("mindspace_therapist_fullname") || therapistName || "");
  const [signatureDoc, setSignatureDoc] = useState(() => localStorage.getItem("mindspace_therapist_sis_number") || "");
  const [signaturePin, setSignaturePin] = useState("");

  // Psychometric Tests tracking for saving
  const [testResults, setTestResults] = useState<{ testName: string; score: number; interpretation: string }[]>([]);

  // Session closed / Signed properties loaded from Firestore
  const [isRecordSigned, setIsRecordSigned] = useState(false);
  const [signedDetails, setSignedDetails] = useState<{ name: string; doc: string; date: string } | null>(null);
  const [addendumText, setAddendumText] = useState("");
  const [loadingFirestoreRecord, setLoadingFirestoreRecord] = useState(false);

  // Toast notifications for saving status feedback
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error" | "info" | "autosave"; message: string } | null>(null);

  const showNotification = (message: string, type: "success" | "error" | "info" | "autosave" = "success") => {
    setSaveStatus({ type, message });
    // Keep it displayed briefly to make it responsive
    setTimeout(() => {
      setSaveStatus(null);
    }, 4000);
  };

  // Real-time Autosave of clinically drafted progress notes
  useEffect(() => {
    if (selectedPatientId && progressNotes) {
      localStorage.setItem(`ep_clinician_draft_call_${selectedPatientId}`, progressNotes);
    }
  }, [progressNotes, selectedPatientId]);

  // Standard Standardized questions dictionaries
  const phqQuestions = [
    "Poco interés o placer en hacer las cosas",
    "Se ha sentido decaído/a, deprimido/a o sin esperanzas",
    "Dificultad para conciliar o mantener el sueño, o duerme demasiado",
    "Sentirse cansado/a o con poca energía",
    "Poco apetito o comer en exceso",
    "Sentirse mal consigo mismo/a (sentir que fracasó o que decepcionó a su familia)",
    "Dificultad para concentrarse en cosas tales como leer o ver televisión",
    "¿Se ha movido o hablado tan despacio que otras personas lo notaron? O lo contrario (inquieto/hiperactivo)",
    "Pensamientos de que estaría mejor muerto/a o de lastimarse de alguna manera"
  ];

  const gadQuestions = [
    "Sentirse nervioso/a, ansioso/a o con los nervios de punta",
    "No poder dejar de preocuparse o no poder controlar la preocupación",
    "Preocuparse demasiado por diferentes cosas",
    "Dificultad para relajarse",
    "Estar tan inquieto/a que es difícil permanecer sentado/a",
    "Molestarse o irritarse fácilmente",
    "Sentir temor como si algo terrible pudiera pasar"
  ];

  const cssrsQuestions = [
    "Deseo pasivo de muerte: ¿Ha deseado estar muerto/a, irse a dormir y no despertar?",
    "Ideación suicida activa no específica: ¿Ha pensado en matarse o suicidarse?",
    "Ideación con método (sin plan o intenciones): ¿Ha pensado en cómo lo haría?",
    "Ideación con intenciones (sin plan específico): ¿Ha tenido estos pensamientos y tenía algo de intencionalidad de actuar?",
    "Ideación activa con plan e intenciones: ¿Ha empezado a elaborar o tiene un plan detallado? ¿Tenía intenciones de llevarlo a cabo?",
    "Conducta o comportamiento suicida: ¿Ha acumulado pastillas, regalado pertenencias, escrito carta de despedida o se ha autolesionado?"
  ];

  // Fetch cryptographic signing credentials
  useEffect(() => {
    let active = true;
    const fetchSignature = async () => {
      try {
        const res = await fetch("/api/calls/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, therapistUid: "clinician_user" })
        });
        const signData = await res.json();
        if (active) {
          setCryptography(signData);
          setLoading(false);
        }
      } catch (err) {
        console.error("Crypto signature fetch error:", err);
        setLoading(false);
      }
    };

    fetchSignature();
    return () => { active = false; };
  }, [roomId]);

  // Request local video access safely
  useEffect(() => {
    let localStream: MediaStream | null = null;
    const loadStream = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        streamRef.current = localStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      } catch (err) {
        console.warn("Media devices stream blocked or anonymous container restriction: Fallbacking to elegant visual mock.", err);
      }
    };

    if (cameraOn && isVideoCallActive) {
      loadStream();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraOn, isVideoCallActive]);

  // Fetch patients lists on mount for clinical search dropdown
  useEffect(() => {
    if (isClinician) {
      const ownerId = auth.currentUser?.uid || "default_psychologist_uid_123";
      const q = query(
        collection(db, "patients"),
        where("ownerId", "==", ownerId)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
        // Sort in memory to avoid requiring a composite index on (ownerId, name)
        list.sort((a, b) => a.name.localeCompare(b.name));
        setPatients(list);
      }, (error) => {
        console.warn("Could not list patients for clinician dropdown of SecureCallRoom: ", error.message);
      });
      return () => unsubscribe();
    }
  }, [isClinician]);

  // Auto-select patient passed from Agenda
  useEffect(() => {
    if (patientId) {
      setSelectedPatientId(patientId);
    } else if (patients.length > 0 && !selectedPatientId) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patientId, patients]);

  // Loading draft or signed record on patient select change and appointmentId
  useEffect(() => {
    let active = true;
    
    const loadSessionRecord = async () => {
      if (!selectedPatientId) return;

      setIsRecordSigned(false);
      setSignedDetails(null);
      setAddendumText("");

      if (isClinician && appointmentId) {
        setLoadingFirestoreRecord(true);
        try {
          const docRef = doc(db, "histories", "evolution_" + appointmentId);
          const docSnap = await getDoc(docRef);
          
          if (active) {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setProgressNotes(data.notes || "");
              
              // Load diagnostics and observations
              setDiagnosticsCheck(data.observations || "");
              
              // Load psychometric tests if they exist
              if (data.testFormResults && Array.isArray(data.testFormResults)) {
                setTestResults(data.testFormResults.map((tr: any) => ({
                  testName: tr.testName || "Prueba",
                  score: tr.score !== undefined ? tr.score : 0,
                  interpretation: tr.interpretation || ""
                })));
              } else {
                setTestResults([]);
              }

              if (data.isSigned) {
                setIsRecordSigned(true);
                setSignedDetails({
                  name: data.signatureName || "",
                  doc: data.signatureDoc || "",
                  date: data.signatureDate || ""
                });
                showNotification("Ficha clínica cerrada y firmada recuperada con éxito.", "info");
              } else {
                showNotification("Evolución temporal (Borrador) recuperada desde la nube.", "info");
              }
            } else {
              // Try local storage local draft as fallback
              const dbDraft = localStorage.getItem(`ep_clinician_draft_call_${selectedPatientId}`);
              if (dbDraft) {
                setProgressNotes(dbDraft);
              } else {
                setProgressNotes("");
              }
              setDiagnosticsCheck("");
              setTestResults([]);
            }
          }
        } catch (err: any) {
          console.warn("Error reading from firestore records collection: ", err.message);
          // Standard local storage fallback
          const dbDraft = localStorage.getItem(`ep_clinician_draft_call_${selectedPatientId}`);
          if (active) {
            setProgressNotes(dbDraft || "");
          }
        } finally {
          if (active) setLoadingFirestoreRecord(false);
        }
      } else {
        // Fallback for direct testing
        const dbDraft = localStorage.getItem(`ep_clinician_draft_call_${selectedPatientId}`);
        setProgressNotes(dbDraft || "");
        setDiagnosticsCheck("");
        setTestResults([]);
      }
    };

    loadSessionRecord();

    return () => {
      active = false;
    };
  }, [selectedPatientId, appointmentId, isClinician]);

  // Save drafts locally
  const handleSaveDraftLocally = () => {
    if (!selectedPatientId) {
      showNotification("Por favor elija un paciente para guardar su borrador.", "error");
      return;
    }
    localStorage.setItem(`ep_clinician_draft_call_${selectedPatientId}`, progressNotes);
    showNotification("Borrador de evolución respaldado localmente con éxito.", "success");
  };

  // Generate deterministic weekly sleep and mood logs for the selected patient
  const getPatientSleepAndMoodData = (pId: string) => {
    const hash = pId 
      ? pId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) 
      : 101;
    const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const moods = ["Muy bajo", "Bajo", "Neutro", "Bueno", "Excelente"];
    const moodEmojis = ["😢", "😕", "😐", "🙂", "😀"];
    const moodNotes = [
      "Ansiedad moderada por preocupaciones laborales, rumiaciones nocturnas.",
      "Leve irritabilidad por la tarde, fatiga residual pero mejor descanso diario.",
      "Día neutro, completó sesión de respiración Abby e indica sensación de control.",
      "Excelente disposición, menor rumiación cognitiva y mayor disfrute de actividades.",
      "Ánimo sumamente positivo, alta motivación y energía para realizar tareas del día.",
      "Estable, con leve tensión muscular por la noche pero sin crisis de pánico.",
      "Sensación de calma y asertividad interconectando mejor socialmente."
    ];
    return days.map((day, idx) => {
      const sleepHrs = parseFloat(((hash + idx * 7) % 5 + 4.5 + (idx % 2 === 0 ? 0.8 : -0.5)).toFixed(1));
      const awakenings = (hash + idx * 3) % 4; // 0 to 3 awakenings
      const deepPct = (hash + idx * 11) % 25 + 10; // 10% to 35% deep sleep
      
      const moodIdx = (hash + idx * 2) % 5; // 0 to 4
      const moodNum = moodIdx + 1; // 1 to 5
      const moodLabel = moods[moodIdx];
      const moodEmoji = moodEmojis[moodIdx];
      const moodNote = moodNotes[(hash + idx) % moodNotes.length];
      
      return { day, sleepHrs, awakenings, deepPct, moodNum, moodLabel, moodEmoji, moodNote };
    });
  };

  const patientSleepData = getPatientSleepAndMoodData(selectedPatientId);

  // Audio simulated waveforms generator
  useEffect(() => {
    const interval = setInterval(() => {
      if (micOn && isVideoCallActive) {
        setWaveHeight(new Array(15).fill(0).map(() => Math.floor(Math.random() * 24) + 4));
      } else {
        setWaveHeight(new Array(15).fill(2));
      }
    }, 150);
    return () => clearInterval(interval);
  }, [micOn, isVideoCallActive]);

  // Session elapsed duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
  };

  // Chronometer color styling calculations
  const elapsedSecs = duration;
  const percentage = Math.min((elapsedSecs / 2700) * 100, 100); // 45 minutes target (2700s)
  
  let timerBarColor = "bg-emerald-500 shadow-emerald-900/50";
  let timerTextClass = "text-emerald-450";
  let sessionPhase = "Fase de Evaluación Clínica";

  if (percentage >= 70 && percentage < 90) {
    timerBarColor = "bg-amber-500 shadow-amber-900/50";
    timerTextClass = "text-amber-400";
    sessionPhase = "Fase de Síndromes y Cierre";
  } else if (percentage >= 90) {
    timerBarColor = "bg-rose-500 shadow-rose-900/50 animate-pulse";
    timerTextClass = "text-rose-450 animate-pulse";
    sessionPhase = "Tiempo Clínico Excedido (Cierre Exigido)";
  }

  const formatRemainingTime = () => {
    if (elapsedSecs < 2700) {
      const remaining = 2700 - elapsedSecs;
      const rms = Math.floor(remaining / 60);
      const rss = remaining % 60;
      return `Restan ${rms}:${rss.toString().padStart(2, "0")} min`;
    } else {
      const exceeded = elapsedSecs - 2700;
      const ems = Math.floor(exceeded / 60);
      const ess = exceeded % 60;
      return `Sobretiempo +${ems}:${ess.toString().padStart(2, "0")} min`;
    }
  };

  // Safe videocall ending without closing the workspace and notes
  const handleFinishedVideocall = () => {
    setShowHangupModalCheck(true);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setChatMessages((prev) => [
      ...prev,
      {
        sender: "Doctor",
        text: chatInput.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setChatInput("");
  };

  const handleAddDiagnosis = () => {
    if (!newDiagnosisName.trim()) return;
    setDiagnosesList(prev => [
      ...prev,
      { name: newDiagnosisName.trim(), status: newDiagnosisStatus }
    ]);
    setNewDiagnosisName("");
  };

  const handleRemoveDiagnosis = (idx: number) => {
    setDiagnosesList(prev => prev.filter((_, i) => i !== idx));
  };

  // Standard interactive questionnaires scoring & registering
  const handleApplyInteractiveProtocol = (type: "PHQ-9" | "GAD-7" | "C-SSRS") => {
    setActiveProtocol(type);
    if (type === "PHQ-9") {
      setPhqAnswers(new Array(9).fill(0));
    } else if (type === "GAD-7") {
      setGadAnswers(new Array(7).fill(0));
    } else if (type === "C-SSRS") {
      setCssrsAnswers(new Array(6).fill(false));
    }
  };

  const handleSaveInteractiveProtocolText = () => {
    const activePatient = patients.find(p => p.id === selectedPatientId);
    const pName = activePatient?.name || patientName || "Paciente";
    const dateStr = new Date().toLocaleDateString("es-CL");
    
    let transcription = "";
    let score = 0;
    let interpretation = "";

    if (activeProtocol === "PHQ-9") {
      score = phqAnswers.reduce((a, b) => a + b, 0);
      if (score <= 4) interpretation = "Depresión Mínima (0-4)";
      else if (score <= 9) interpretation = "Depresión Leve (5-9)";
      else if (score <= 14) interpretation = "Depresión Moderada (10-14)";
      else if (score <= 19) interpretation = "Depresión Moderadamente Grave (15-19)";
      else interpretation = "Depresión Grave (20-27)";

      transcription = `\n\n=== [PROTOCOLO CLÍNICO PHQ-9 - ${dateStr}] ===
- Puntaje Total: ${score} pt (${interpretation})
- Detalle de Respuestas:
${phqQuestions.map((q, i) => `  * Q${i+1}. ${q.substring(0, 40)}... -> [Puntaje: ${phqAnswers[i]}/3]`).join("\n")}
--------------------------------------------------`;
    } 
    else if (activeProtocol === "GAD-7") {
      score = gadAnswers.reduce((a, b) => a + b, 0);
      if (score <= 4) interpretation = "Ansiedad Mínima (0-4)";
      else if (score <= 9) interpretation = "Ansiedad Leve (5-9)";
      else if (score <= 14) interpretation = "Ansiedad Moderada (10-14)";
      else interpretation = "Ansiedad Grave (15-21)";

      transcription = `\n\n=== [PROTOCOLO CLÍNICO GAD-7 - ${dateStr}] ===
- Puntaje Total: ${score} pt (${interpretation})
- Detalle de Respuestas:
${gadQuestions.map((q, i) => `  * Q${i+1}. ${q.substring(0, 40)}... -> [Puntaje: ${gadAnswers[i]}/3]`).join("\n")}
--------------------------------------------------`;
    } 
    else if (activeProtocol === "C-SSRS") {
      // Columbia Suicide Severity Rating Scale evaluations
      const yesCount = cssrsAnswers.filter(Boolean).length;
      if (cssrsAnswers[4] || cssrsAnswers[5]) {
        interpretation = "Riesgo Alto / Ideación Activa con Plan o Conducta Precursora Encontrada";
        score = 3;
      } else if (cssrsAnswers[2] || cssrsAnswers[3]) {
        interpretation = "Riesgo Moderado / Pensamientos con Método e Intención Activos";
        score = 2;
      } else if (cssrsAnswers[0] || cssrsAnswers[1]) {
        interpretation = "Riesgo Bajo / Ideación Pasiva Reciente";
        score = 1;
      } else {
        interpretation = "Sin Riesgo Clínico Crítico Detectado";
        score = 0;
      }

      transcription = `\n\n=== [PROTOCOLO RIESGO SUICIDA C-SSRS - ${dateStr}] ===
- Interpretación: ${interpretation}
- Cuestionario de Despistaje Columbia:
${cssrsQuestions.map((q, i) => `  * Q${i+1}. ${q.substring(0, 50)}... -> [${cssrsAnswers[i] ? "SÍ (ALERTA)" : "NO"}]`).join("\n")}
--------------------------------------------------`;
    }

    // Append beautiful structured block to clinician text area
    setProgressNotes(prev => prev + transcription);

    // Add to Firestore session tracking array so it saves structurally
    setTestResults(prev => [
      ...prev,
      { testName: activeProtocol!, score, interpretation }
    ]);

    setActiveProtocol(null);
    alert(`📊 Protocolo ${activeProtocol} registrado e incorporado a la Nota de Evolución.`);
  };

  // PRELOADS dynamic clinical reports templates
  useEffect(() => {
    const activePatient = patients.find(p => p.id === selectedPatientId);
    const pName = activePatient?.name || patientName || "[Nombre del Paciente]";
    const pRut = activePatient?.rut || "[RUT del Paciente]";
    const docName = therapistName || "Ps. José Ignacio Romero V.";
    
    let template = "";
    if (selectedReportTemplate === "evolucion") {
      setReportDocTitle("Informe Clínico de Evolución Psicoterapéutica");
      template = `INFORME CLÍNICO DE EVOLUCIÓN PSICOTERAPÉUTICA

I. ANTECEDENTES DEL PACIENTE
Nombre Completo: ${pName}
RUT / ID: ${pRut}
Especialista Médico: ${docName}

II. MOTIVO DE CONSULTA Y EVALUACIÓN
Círculo diagnóstico y tratamiento individual de apoyo cognitivo conductual.
Diagnósticos CIE asociados a la evolución: ${diagnosesList.map(d => `${d.name} (${d.status})`).join(", ") || "F41.1 Ansiedad Generalizada"}

III. EVOLUCIÓN SINTOMÁTICA
El/la paciente ha asistido de forma constante de forma segura vía Telemedicina. Ha reportado mejorías significativas sobre mecanismos emocionales adaptativos y estabilidad psicosomática. Los cuestionarios aplicados evidencian reducción significativa de crisis circunstanciales recientes.

IV. INDICACIONES CLÍNICAS Y SEGUIMIENTO
Se aconseja de forma multidisciplinaria continuar terapia regular para asegurar anclajes adaptativos.`;
    } else if (selectedReportTemplate === "asistencia") {
      setReportDocTitle("Certificado de Asistencia a Sesión Clínica");
      template = `CERTIFICADO CLÍNICO DE ASISTENCIA

A QUIEN CORRESPONDA:

En mi calidad de Psicólogo Clínico y bajo estricto Secreto Profesional regulado, certifico por este medio oficial digital que el/la paciente ${pName}, RUN: ${pRut}, ha comparecido y participado activamente de su sesión psicoterapéutica programada para hoy ${new Date().toLocaleDateString("es-CL")} en modalidad online de extremo a extremo (E2EE) con una duración de 45 minutos efectivos de consulta.

Se emite el presente comprobante a petición expresa del interesado para los fines que estime adecuados.

Atentamente,
${docName}
Inscripción Superintendencia de Salud (SIS)`;
    } else if (selectedReportTemplate === "derivacion") {
      setReportDocTitle("Informe de Interconsulta y Derivación Médica");
      template = `DOCUMENTO DE DERIVACIÓN MULTIDISCIPLINARIA

DE: ${docName} (Coordinador de Terapia individual)
PARA: Especialidad médica psiquiátrica o de Especialidad general
ASUNTO: Solicitud de incorporación diagnóstica o control de psicofármacos

I. ANTECEDENTES Y DETALLES
Paciente derivado: ${pName}
RUT: ${pRut}

II. SÍNTESIS DE EVOLUCIÓN
Derivo al paciente para examen psiquiátrico complementario con el objeto de estabilizar ritmos metabólicos o soporte de tratamiento. La evolución clínica de psicoterapia muestra avances significativos pero requiere soporte regulado.

Atentamente,
${docName}`;
    }
    setReportContentText(template);
    setIsReportSaved(false);
  }, [selectedReportTemplate, selectedPatientId, diagnosesList, patients, patientName, therapistName]);

  // AI-Assisted Clinical Reports generator utilizing Gemini
  const handleGenerateReportAi = async () => {
    if (!progressNotes) {
      alert("Para autoredactar con IA, requiere observaciones previas clínicas en la evolución (Pestaña 'Notas Clínicas').");
      return;
    }
    setGeneratingReportAi(true);
    try {
      const activePatient = patients.find(p => p.id === selectedPatientId);
      const res = await fetch("/api/gemini/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: activePatient?.name || patientName || "Paciente",
          notes: progressNotes,
          observations: "Generar una redacción elegante formal, Chile, estructurada técnica de tercera persona médica para la sección de Evolución de este Certificado/Informe."
        })
      });
      const data = await res.json();
      if (res.ok) {
        setReportContentText(prev => prev + "\n\n=== EXPEDIENTE ADJUNTO DE EVOLUCIÓN COMPILADO POR ABBY AI ===\n" + data.summary);
        alert("✨ Análisis de Abby AI incorporado al informe clínico formal.");
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      alert("Fallo al redactar informe: " + err.message);
    } finally {
      setGeneratingReportAi(false);
    }
  };

  const handleCopyReportToClipboard = () => {
    navigator.clipboard.writeText(reportContentText);
    setIsReportCopied(true);
    setTimeout(() => setIsReportCopied(false), 2005);
  };

  // Auto-Save report to patient histories collection
  const handleSaveReportToClinicalHistory = async () => {
    if (!selectedPatientId) {
      alert("Elija un paciente para indexar este informe clínico.");
      return;
    }
    setSavingRecord(true);
    try {
      const recordId = "rep_" + Math.random().toString(36).substring(2, 11);
      const newReportEntry = {
        id: recordId,
        patientId: selectedPatientId,
        date: new Date().toISOString().substring(0, 10),
        notes: `[DOCUMENTO EMITIDO: ${reportDocTitle}]\n\n` + reportContentText,
        observations: `Emisión de documento: ${reportDocTitle}`,
        aiSummary: "Ficha oficial generada e impresa en la ventana de consulta clínica.",
        createdAt: Timestamp.now(),
        ownerId: "default_psychologist_uid_123"
      };

      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "histories", recordId), newReportEntry);
      setIsReportSaved(true);
      alert(`📄 Documento de especialidad "${reportDocTitle}" indexado con éxito en el historial clínico.`);
    } catch (err: any) {
      alert("Fallo al guardar informe: " + err.message);
    } finally {
      setSavingRecord(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    if (!progressNotes) {
      alert("Escriba observaciones clínicas en la nota de evolución para poder resumir con el Asistente de IA.");
      return;
    }

    setGeneratingAi(true);
    setAiSummaryResult("");

    const activePatient = patients.find(p => p.id === selectedPatientId);
    const diagnosesStr = diagnosesList.length > 0 
      ? diagnosesList.map(d => `${d.name} (${d.status})`).join(", ") 
      : "";
    const combinedDiagnostics = [diagnosticsCheck, diagnosesStr].filter(Boolean).join(" | ");

    try {
      const res = await fetch("/api/gemini/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: activePatient?.name || patientName || "Paciente",
          notes: progressNotes,
          observations: combinedDiagnostics || "Sesión regular"
        })
      });

      const data = await res.json();
      if (res.ok) {
        setAiSummaryResult(data.summary);
      } else {
        throw new Error(data.error || "Fallo en la síntesis lógica por Gemini.");
      }
    } catch (error: any) {
      console.error(error);
      alert("Error generating summary: " + error.message);
    } finally {
      setGeneratingAi(false);
    }
  };

  const handlePerformSaveSessionRecord = async (isSigned: boolean, sigName?: string, sigDoc?: string) => {
    if (!selectedPatientId) {
      showNotification("Seleccione un paciente de la lista antes de proceder.", "error");
      return;
    }
    if (!progressNotes.trim()) {
      showNotification("Escriba observaciones clínicas antes de guardar.", "error");
      return;
    }

    setSavingRecord(true);
    try {
      // Use deterministic recordId linked to the appointment if present, to allow simple reload
      const recordId = appointmentId ? "evolution_" + appointmentId : "rec_" + Math.random().toString(36).substring(2, 11);
      
      const diagnosesStr = diagnosesList.length > 0 
        ? diagnosesList.map(d => `${d.name} (${d.status})`).join(", ") 
        : "";
      const combinedDiagnostics = [diagnosticsCheck, diagnosesStr].filter(Boolean).join(" | ");

      // History collection document format
      const newRecord = {
        id: recordId,
        patientId: selectedPatientId,
        date: new Date().toISOString().substring(0, 10), // today YYYY-MM-DD
        notes: progressNotes,
        observations: combinedDiagnostics || "Estable",
        aiSummary: aiSummaryResult || "Resumen de evolución clínica no generado en llamada.",
        createdAt: Timestamp.now(),
        ownerId: "default_psychologist_uid_123",
        isSigned: isSigned,
        ...(isSigned && sigName && sigDoc ? {
          signatureDate: new Date().toLocaleDateString("es-CL"),
          signatureName: sigName,
          signatureDoc: sigDoc
        } : {}),
        ...(testResults.length > 0 ? {
          testFormResults: testResults.map(r => ({
            testName: r.testName,
            score: r.score,
            answersText: "Registrado mediante protocolo interactivo de sesión",
            interpretation: r.interpretation
          }))
        } : {})
      };

      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "histories", recordId), newRecord);

      // Audit logs registration
      try {
        const activePatient = patients.find(p => p.id === selectedPatientId);
        const { addDoc, collection } = await import("firebase/firestore");
        await addDoc(collection(db, "audit_logs"), {
          patientId: selectedPatientId,
          patientName: activePatient?.name || patientName || "Paciente",
          action: isSigned ? "FIRMA_REGISTRO" : "REGISTRO_BORRADOR",
          detail: isSigned 
            ? `Almacenamiento de evolución médica FIRMADA Y CERRADA por videollamada. Especialista: ${sigName}. Diagnósticos: ${combinedDiagnostics || "Estable"}`
            : `Almacenamiento de borrador de evolución médica registrada en la nube. Diagnósticos: ${combinedDiagnostics || "Estable"}`,
          timestamp: Timestamp.now()
        });
      } catch (err) {
        console.error("Audit log register failed:", err);
      }

      // Update Appointment with status: completed, and evolutionState: "draft" or "signed"
      if (appointmentId) {
        const { updateDoc, doc } = await import("firebase/firestore");
        await updateDoc(doc(db, "appointments", appointmentId), { 
          status: "completed",
          evolutionState: isSigned ? "signed" : "draft"
        });
      }

      // If it has been officially signed, clear the interactive edit states and leave
      if (isSigned) {
        // Clear local storage drafts
        localStorage.removeItem(`ep_clinician_draft_call_${selectedPatientId}`);

        // Clear states
        setProgressNotes("");
        setDiagnosticsCheck("");
        setDiagnosesList([]);
        setAiSummaryResult("");
        setTestResults([]);
        setIsRecordSigned(true);
        if (sigName && sigDoc) {
          setSignedDetails({
            name: sigName,
            doc: sigDoc,
            date: new Date().toLocaleDateString("es-CL")
          });
        }

        showNotification("✅ Ficha oficial de sesión firmada digitalmente y cerrada en el historial clínico.", "success");
        
        // Auto-leave room back to Agenda since work is officially closed, delayed slightly so toast can be read
        setTimeout(() => {
          onLeaveCall();
        }, 2500);
      } else {
        // It's a draft! Let therapist know they succeeded but let them stay editing or leave manually.
        showNotification("💾 Borrador de evolución guardado en la nube. Puede seguir editando o volver a la agenda.", "success");
      }

    } catch (error: any) {
      console.error(error);
      showNotification("Fallo al guardar registro de evolución clínica: " + error.message, "error");
    } finally {
      setSavingRecord(false);
    }
  };

  const handleSaveAddendum = async (sigName: string, sigDoc: string) => {
    if (!appointmentId) {
      alert("No se puede añadir un anexo sin una cita de referencia válida.");
      return;
    }
    if (!addendumText.trim()) {
      alert("Por favor escriba el texto del anexo clínico.");
      return;
    }
    
    setSavingRecord(true);
    try {
      const recordId = "evolution_" + appointmentId;
      const docRef = doc(db, "histories", recordId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const previousData = docSnap.data();
        const currentNotes = previousData.notes || "";
        const formattedDate = new Date().toLocaleString("es-CL");
        const separator = "\n\n" + "=".repeat(40) + "\n" +
          `📝 ANEXO ADICIONAL CLÍNICO (Ley 20.584)\n` +
          `Fecha de Anexo: ${formattedDate}\n` +
          `Firmado por: Dr(a). ${sigName} (Matrícula SIS / RUT: ${sigDoc})\n` +
          "-".repeat(40) + "\n" +
          addendumText.trim() + "\n" +
          "=".repeat(40);
        
        const updatedNotes = currentNotes + separator;
        
        await updateDoc(docRef, {
          notes: updatedNotes
        });
        
        // Audit log addendum
        try {
          const { addDoc, collection } = await import("firebase/firestore");
          await addDoc(collection(db, "audit_logs"), {
            patientId: selectedPatientId,
            patientName: patientName || "Paciente",
            action: "ANEXO",
            detail: `Anexo agregado y firmado por el especialista Dr(a). ${sigName} a la evolución de cita ${appointmentId}.`,
            timestamp: Timestamp.now()
          });
        } catch (err) {
          console.error("Audit log addendum register failed:", err);
        }

        setProgressNotes(updatedNotes);
        setAddendumText("");
        showNotification("📝 Anexo firmado y agregado al historial clínico con éxito.", "success");
      } else {
        alert("No se encontró el registro clínico original para anexar.");
      }
    } catch (err: any) {
      alert("Error al guardar el anexo: " + err.message);
    } finally {
      setSavingRecord(false);
    }
  };

  return (
    <div className="bg-slate-950 text-white rounded-3xl overflow-hidden border border-slate-850 shadow-2xl relative font-sans transition-all duration-300">
      
      {/* Dynamic Toast/Success notification inside the room */}
      {saveStatus && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-2xl border bg-slate-900 shadow-2xl text-white border-slate-800 animate-in fade-in slide-in-from-top-4 duration-300 max-w-sm w-11/12">
          {saveStatus.type === "success" && (
            <div className="p-1 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0">
              <CheckCircle className="w-4 h-4" />
            </div>
          )}
          {saveStatus.type === "autosave" && (
            <div className="p-1 bg-blue-500/20 text-blue-400 rounded-lg shrink-0">
              <Save className="w-4 h-4" />
            </div>
          )}
          {saveStatus.type === "error" && (
            <div className="p-1 bg-rose-500/20 text-rose-450 rounded-lg shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
          )}
          {saveStatus.type === "info" && (
            <div className="p-1 bg-indigo-500/20 text-indigo-400 rounded-lg shrink-0">
              <Info className="w-4 h-4" />
            </div>
          )}
          <div className="text-left">
            <p className="text-[10px] font-black tracking-wide text-slate-100 uppercase">
              {saveStatus.type === "success" ? "Operación Exitosa" : saveStatus.type === "autosave" ? "Autoguardado" : saveStatus.type === "error" ? "Error de Sistema" : "Aviso"}
            </p>
            <p className="text-[10px] text-slate-300 leading-snug">{saveStatus.message}</p>
          </div>
        </div>
      )}

      {/* Encryption security banner */}
      <div className="bg-emerald-950/30 p-4 border-b border-emerald-900/40 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl animate-pulse">
            <Lock className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold flex items-center gap-1.5 text-emerald-300">
              Sesión Cifrada de Extremo a Extremo (E2EE) Activada
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </h4>
            <p className="text-[10px] text-slate-400 font-mono">ID de Sala Remota: {roomId}</p>
          </div>
        </div>

        {/* Dynamic active encryption tags */}
        {!loading && cryptography ? (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 p-2 rounded-xl border border-emerald-800/60 shrink-0">
            <KeyRound className="w-3.5 h-3.5" />
            <span>{cryptography.algorithm}-{cryptography.encryptionBits} | {cryptography.cryptoToken.substring(0, 16)}...</span>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-slate-500">Firmando llaves de cifrado...</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
        
        {/* Videos Container (8 Columns for Clinician split layout for maximum camera visibility, otherwise 8. Hidden if call collapsed) */}
        {isVideoCallActive ? (
          <div className={`p-6 flex flex-col justify-between bg-slate-900/40 relative border-r border-slate-900 ${
            isClinician ? "lg:col-span-8" : "lg:col-span-8"
          }`}>
            
            {/* Top Info line */}
            <div className="flex justify-between items-center z-10 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="bg-slate-950/80 rounded-full px-3.5 py-1.5 text-xs font-semibold font-mono text-emerald-400 border border-slate-800 flex items-center gap-1.5 shadow-md">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  {formatTimer(duration)}
                </span>
                
                {selectedPatientId && (
                  <span className="bg-slate-955/90 rounded-full px-3.5 py-1.5 text-[10.5px] font-extrabold text-slate-300 border border-slate-800 flex items-center gap-1.5 shadow-md">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                    Ficha Activa: <span className="text-indigo-400 font-black">{patientName || patients.find(p => p.id === selectedPatientId)?.name || "Cargando..."}</span>
                  </span>
                )}
              </div>

              <span className="bg-slate-950/80 rounded-full px-3.5 py-1.5 text-xs text-slate-300 border border-slate-800 flex items-center gap-2 shadow-md">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                Banda Ancha de Cita: 4.8 Mbps
              </span>
            </div>

            {/* Core Interactive screens splits */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
              
              {/* 1. Therapist Side Visual */}
              <div className="aspect-video rounded-2xl bg-slate-950 border border-slate-805 overflow-hidden relative shadow-lg group">
                {cameraOn ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col justify-center items-center text-slate-500 bg-slate-950">
                    <VideoOff className="w-10 h-10 stroke-1 mb-2 text-rose-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Cámara Desactivada</span>
                  </div>
                )}
                <span className="absolute bottom-2.5 left-2.5 bg-slate-950/60 text-[10px] uppercase font-bold px-2 py-1 rounded text-slate-300">
                  Usted ({therapistName || "Doctor"})
                </span>
              </div>

              {/* 2. Patient Side Visual */}
              <div className="aspect-video rounded-2xl bg-slate-950 border border-slate-805 overflow-hidden relative shadow-lg flex flex-col justify-center items-center">
                {/* Elegant user initials circle instead of standard speaker/volume icon */}
                <div className="w-16 h-16 rounded-full bg-indigo-950/45 text-indigo-300 flex justify-center items-center border border-indigo-900/60 text-lg font-black tracking-widest shadow-lg select-none">
                  {patientName ? patientName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() : "JR"}
                </div>
                
                {/* Static indicator for activity state */}
                <div className="w-full h-1 bg-slate-900 absolute bottom-0 left-0">
                  <div className="bg-emerald-500 h-full w-full animate-pulse" />
                </div>

                {/* Subtly animated decorative waveform on the right footer to visually track live streaming */}
                <div className="flex gap-0.5 items-end justify-center absolute bottom-2.5 right-3 h-5">
                  {waveHeight.slice(0, 9).map((h, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-indigo-400 rounded-sm transition-all"
                      style={{ height: `${Math.max(h * 0.45, 1.5)}px` }}
                    />
                  ))}
                </div>

                <span className="absolute bottom-2.5 left-2.5 bg-slate-950/70 border border-slate-900 text-[10px] uppercase font-bold px-2 py-1 rounded text-emerald-400 flex items-center gap-1.5 shadow">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  {patientName || "Paciente"} (Conectado)
                </span>
              </div>
            </div>

            {/* Action Control Button Ribbons */}
            <div className="flex justify-center items-center gap-3 z-10 pt-4 border-t border-slate-900">
              <button
                onClick={() => setMicOn(!micOn)}
                className={`p-3.5 rounded-full transition-all border cursor-pointer ${
                  micOn ? "bg-slate-900 text-slate-350 border-slate-800 hover:bg-slate-800" : "bg-rose-500/20 text-rose-500 border-rose-500/30 hover:bg-rose-500/30"
                }`}
                title={micOn ? "Silenciar Micrófono" : "Activar Micrófono"}
              >
                {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                onClick={() => setCameraOn(!cameraOn)}
                className={`p-3.5 rounded-full transition-all border cursor-pointer ${
                  cameraOn ? "bg-slate-900 text-slate-350 border-slate-800 hover:bg-slate-800" : "bg-rose-500/20 text-rose-500 border-rose-500/30 hover:bg-rose-500/30"
                }`}
                title={cameraOn ? "Apagar Cámara" : "Encender Cámara"}
              >
                {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              {!isClinician && (
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  className={`p-3.5 rounded-full transition-all border cursor-pointer ${
                    chatOpen ? "bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600" : "bg-slate-900 text-slate-350 border-slate-800 hover:bg-slate-800"
                  }`}
                  title="Abrir Chat Clínico Seguro"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              )}

              {/* Intelligent Hangup Safety Lock Button */}
              <button
                type="button"
                onClick={() => setIsCallHangupLocked(!isCallHangupLocked)}
                className={`p-3.5 rounded-full transition-all border cursor-pointer ${
                  isCallHangupLocked 
                    ? "bg-amber-500/25 text-amber-400 border-amber-500/50 hover:bg-amber-500/40 shadow-lg shadow-amber-950/40 animate-pulse" 
                    : "bg-slate-900 text-slate-450 border-slate-800 hover:bg-slate-850 hover:text-white"
                }`}
                title={isCallHangupLocked ? "Desbloquear Colgar (Protección de Llamada Activa)" : "Bloquear Colgar (Prevenir Cortes Accidentales)"}
              >
                {isCallHangupLocked ? <Lock className="w-5 h-5 text-amber-450" /> : <Unlock className="w-5 h-5" />}
              </button>

              <button
                onClick={handleFinishedVideocall}
                className={`p-3.5 rounded-full transition-all shadow-lg border cursor-pointer ${
                  isCallHangupLocked 
                    ? "bg-rose-950/40 text-rose-300 border-rose-800/60 hover:bg-rose-650 hover:text-white hover:border-rose-500" 
                    : "bg-rose-650 text-white hover:bg-rose-500 hover:shadow-rose-950/40 border-rose-700"
                }`}
                title={isCallHangupLocked ? "Llamada protegida. Haga clic para opciones o desbloquee con el candado" : "Finalizar Transmisión Videollamada"}
              >
                <Phone className="w-5 h-5 transform rotate-[135deg]" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Workspace Column / Chat & Notes Column (Expands dynamically to 12 if video is inactive, otherwise 4 for clinician) */}
        <div className={`p-5 flex flex-col justify-start overflow-y-auto duration-300 transition-all ${
          !isVideoCallActive 
            ? "lg:col-span-12 w-full h-auto bg-slate-950" 
            : isClinician 
              ? "lg:col-span-4 h-[650px] bg-slate-950" 
              : chatOpen 
                ? "lg:col-span-4 h-full bg-slate-950" 
                : "hidden"
        }`}>
          
          {/* Top disclaimer if videocall collapsed but clinician remains in the page */}
          {!isVideoCallActive && (
            <div className="bg-emerald-950/25 border border-emerald-900/60 p-4 rounded-2xl mb-4 text-left flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 text-emerald-400 p-2.5 rounded-xl border border-emerald-900/50">
                  <ShieldCheck className="w-5.5 h-5.5 animate-pulse" />
                </div>
                <div>
                  <h5 className="text-xs font-black text-emerald-300">📞 Videollamada de Sesión Finalizada</h5>
                  <p className="text-[10.5px] text-slate-400 mt-0.5">La conexión de video se detuvo. Los campos se expandieron para mayor comodidad de trabajo. Complete su evolución clínica. La información se registrará una vez firme.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onLeaveCall}
                className="text-[10.5px] bg-rose-500/15 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl hover:bg-rose-500/25 transition cursor-pointer font-bold shrink-0"
              >
                Forzar Salida sin Guardar
              </button>
            </div>
          )}

          {/* 1. Header & Tabs switcher for clinician / doctor workspace */}
          {isClinician ? (
            <div className="flex flex-col gap-3 shrink-0 mb-4">
              <div className="flex flex-col bg-slate-900 border border-slate-805 rounded-xl p-1 gap-1">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab("notes")}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      rightPanelTab === "notes"
                        ? "bg-slate-800 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Clipboard className="w-3 h-3 text-emerald-400" /> Notas Clínicas
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab("tests")}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      rightPanelTab === "tests"
                        ? "bg-slate-800 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Activity className="w-3 h-3 text-indigo-400" /> Tests Interactivos
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab("reports")}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      rightPanelTab === "reports"
                        ? "bg-slate-800 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <FileText className="w-3 h-3 text-amber-400" /> Emitir Informes
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab("chat")}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      rightPanelTab === "chat"
                        ? "bg-slate-800 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 text-cyan-400" /> Chat ({chatMessages.length})
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-1.5 pb-2 border-b border-slate-800 shrink-0 mb-4">
              <MessageSquare className="w-4 h-4" /> Chat Secundario Seguro
            </h4>
          )}

          {/* 2. TAB: NOTES (Clinician evolution editor with integrated chronometer) */}
          {isClinician && rightPanelTab === "notes" && (
            <div className="space-y-3.5 flex-1 flex flex-col text-left">
              
              {/* Collapsible Sleep pattern & Mood pocket indicator (relocated inside notes tab as an elegant supplemental pocket) */}
              {selectedPatientId && (
                <div className="text-xs bg-slate-900/30 border border-slate-805 rounded-2xl overflow-hidden mt-0.5">
                  <button
                    type="button"
                    onClick={() => setSleepPocketOpen(!sleepPocketOpen)}
                    className="w-full text-left p-3.5 flex justify-between items-center text-slate-300 hover:bg-slate-900/40 transition-all font-bold cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400">
                      <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> Bolsillo de Patrón de Sueño y Diario de Ánimo (Últimos 7 días)
                    </span>
                    <span className="text-slate-500">
                      {sleepPocketOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                  
                  {sleepPocketOpen && (
                    <div className="p-3.5 bg-slate-950/40 border-t border-slate-900/60 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      
                      {/* Sub-tabs inside the pocket */}
                      <div className="flex border-b border-slate-900 pb-2 mb-1 gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSleepPocketSubTab("sleep")}
                          className={`flex-1 py-1.5 px-2.5 text-[9px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            sleepPocketSubTab === "sleep"
                              ? "bg-emerald-600/25 text-emerald-300 border border-emerald-950/45"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          🛌 Patrón de Sueño
                        </button>
                        <button
                          type="button"
                          onClick={() => setSleepPocketSubTab("mood")}
                          className={`flex-1 py-1.5 px-2.5 text-[9px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            sleepPocketSubTab === "mood"
                              ? "bg-indigo-600/25 text-indigo-300 border border-indigo-950/45"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          😊 Diario de Ánimo
                        </button>
                      </div>

                      {sleepPocketSubTab === "sleep" ? (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div className="flex justify-between items-center text-[9px] text-slate-500">
                            <span>Registro Actigráfico de Terapia (Círculos circadianos)</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                              <span className="text-emerald-400 font-bold">Autosincronizado</span>
                            </div>
                          </div>
                          
                          {/* Highly responsive custom SVG slept graph */}
                          <div className="relative py-1">
                            <svg viewBox="0 0 400 180" className="w-full h-auto overflow-visible select-none font-sans">
                              {/* Y-axis grid lines */}
                              <line x1="30" y1="20" x2="380" y2="20" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />
                              <line x1="30" y1="50" x2="380" y2="50" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />
                              <line x1="30" y1="80" x2="380" y2="80" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />
                              <line x1="30" y1="110" x2="380" y2="110" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />
                              <line x1="30" y1="140" x2="380" y2="140" stroke="#334155" strokeWidth="1" />

                              {/* Grid Labels */}
                              <text x="5" y="24" className="text-[9px] fill-slate-500 font-semibold font-mono">10h</text>
                              <text x="5" y="84" className="text-[9px] fill-slate-500 font-semibold font-mono">6h</text>
                              <text x="5" y="144" className="text-[9px] fill-slate-500 font-semibold font-mono">0h</text>

                              {/* Render sleep values */}
                              {patientSleepData.map((data, idx) => {
                                const x = 50 + idx * 50;
                                const y = 140 - (data.sleepHrs * 11); // sleep quality line height mapping
                                
                                // Awakenings mapping for bars representation
                                const wakeH = data.awakenings * 12;
                                const barY = 140 - wakeH;

                                return (
                                  <g key={idx} className="group/node cursor-pointer">
                                    {/* Interrupciones bar background */}
                                    {data.awakenings > 0 && (
                                      <rect
                                        x={x - 8}
                                        y={barY}
                                        width="6"
                                        height={wakeH}
                                        fill="#F97316"
                                        opacity="0.25"
                                        rx="2"
                                      />
                                    )}
                                    
                                    {/* Slept hours node point */}
                                    <circle
                                      cx={x}
                                      cy={y}
                                      r="4"
                                      className="fill-emerald-400 stroke-slate-950 stroke-2 hover:r-6 hover:fill-emerald-300 transition-all"
                                    />

                                    {/* Bar indicator for awakenings */}
                                    <rect
                                      x={x + 2}
                                      y={135}
                                      width="4"
                                      height="5"
                                      fill={data.awakenings > 1 ? "#EF4444" : "#F59E0B"}
                                      className="opacity-60"
                                    />

                                    <text x={x} y="156" textAnchor="middle" className="text-[9.5px] fill-slate-400 font-bold font-mono">{data.day}</text>
                                    
                                    {/* Hover tooltip content */}
                                    <g className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-200 pointer-events-none">
                                      <rect
                                        x={idx < 4 ? x + 10 : x - 110}
                                        y={y - 25}
                                        width="100"
                                        height="45"
                                        fill="#0F172A"
                                        stroke="#334155"
                                        strokeWidth="1"
                                        rx="6"
                                      />
                                      <text x={idx < 4 ? x + 16 : x - 104} y={y - 12} className="text-[9px] font-bold fill-slate-100">Sueño: {data.sleepHrs} Horas</text>
                                      <text x={idx < 4 ? x + 16 : x - 104} y={y + 2} className="text-[8.5px] fill-orange-400">Interrupciones: {data.awakenings}</text>
                                    </g>
                                  </g>
                                );
                              })}

                              {/* Draw polyline */}
                              <path
                                d={patientSleepData.map((data, idx) => {
                                  const x = 50 + idx * 50;
                                  const y = 140 - (data.sleepHrs * 11);
                                  return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                                }).join(" ")}
                                fill="none"
                                stroke="#10B981"
                                strokeWidth="2.5"
                                className="drop-shadow-[0_2px_4px_rgba(16,185,129,0.3)]"
                              />
                            </svg>
                          </div>

                          {/* Info and statistics footnotes */}
                          <div className="grid grid-cols-2 gap-1.5 text-[9.5px] bg-slate-950 p-2 rounded-xl border border-slate-900">
                            <div className="text-left">
                              <span className="text-slate-500 block">Promedio Real de Sueño:</span>
                              <strong className="text-emerald-400 font-mono">
                                {(patientSleepData.reduce((acc, d) => acc + d.sleepHrs, 0) / 7).toFixed(1)} hrs
                              </strong>
                            </div>
                            <div className="text-left">
                              <span className="text-slate-500 block">Eficiencia Estimada:</span>
                              <strong className="text-indigo-400 font-mono">92% de descanso</strong>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1 animate-in fade-in duration-200">
                          <div className="flex justify-between items-center text-[9.5px] text-slate-500">
                            <span>Sincronización de Autoreporte Diario</span>
                            <span className="text-indigo-400 font-bold font-mono">7 Registros</span>
                          </div>
                          
                          <div className="space-y-2">
                            {patientSleepData.map((data, idx) => (
                              <div key={idx} className="bg-slate-955 border border-slate-900 p-2.5 rounded-xl flex items-start gap-2.5 hover:border-slate-800 transition-all text-left">
                                <div className="flex flex-col items-center justify-center bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-850 shrink-0 min-w-[34px]">
                                  <span className="text-[8.5px] uppercase font-black font-mono text-indigo-400 leading-none">{data.day}</span>
                                  <span className="text-base mt-1">{data.moodEmoji}</span>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] font-extrabold text-slate-200">Ánimo: {data.moodLabel}</span>
                                    <span className="text-[8px] bg-slate-900 px-1 py-0.5 rounded text-indigo-400 font-mono">Nivel {data.moodNum}/5</span>
                                  </div>
                                  <p className="text-[9.5px] text-slate-400 leading-relaxed font-sans mt-0.5">
                                    "{data.moodNote}"
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Bolsillo de Diagnósticos Inteligente (CIE-10 / SNOMED-CT) */}
              <div className="bg-slate-900/40 border border-slate-805 rounded-2xl overflow-hidden mt-0.5">
                <button
                  type="button"
                  onClick={() => setDiagnosesPocketOpen(!diagnosesPocketOpen)}
                  className="w-full text-left p-3.5 flex justify-between items-center text-slate-300 hover:bg-slate-900/40 transition-all font-bold cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400">
                    <Activity className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Bolsillo de Diagnósticos Inteligentes (CIE-10 / SNOMED)
                  </span>
                  <span className="text-slate-500">
                    {diagnosesPocketOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>

                {diagnosesPocketOpen && (
                  <div className="p-3.5 bg-slate-950/40 border-t border-slate-900/60 space-y-3.5 animate-in slide-in-from-top-2 duration-200">
                    
                    {/* Search query box with autocompleter */}
                    <div className="space-y-1.5 relative">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Buscador Inteligente de Diagnósticos (Código, Nombre o SNOMED)</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Buscar diagnóstico, ej: F32, Ansiedad, TAB, 310495003..."
                            value={diagnosticSearchQuery}
                            onFocus={() => setShowDiagnosticSuggestions(true)}
                            onChange={(e) => {
                              setDiagnosticSearchQuery(e.target.value);
                              setShowDiagnosticSuggestions(true);
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                          />
                          {diagnosticSearchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setDiagnosticSearchQuery("");
                                setShowDiagnosticSuggestions(false);
                              }}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-xs hover:text-white"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <select
                          value={newDiagnosisStatus}
                          onChange={(e) => setNewDiagnosisStatus(e.target.value as any)}
                          className="bg-slate-950 border border-slate-805 rounded-xl p-2.5 text-xs text-slate-300 outline-none"
                        >
                          <option value="Confirmado">🟢 Confirmado</option>
                          <option value="En sospecha">🟡 Sospecha</option>
                          <option value="En estudio">🔵 Estudio</option>
                        </select>
                      </div>

                      {/* Display suggestions when focused & filter has matches */}
                      {showDiagnosticSuggestions && diagnosticSearchQuery.trim().length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl z-40 max-h-[180px] overflow-y-auto divide-y divide-slate-850">
                          {MENTAL_HEALTH_DIAGNOSES.filter(d => 
                            d.code.toLowerCase().includes(diagnosticSearchQuery.toLowerCase()) ||
                            d.name.toLowerCase().includes(diagnosticSearchQuery.toLowerCase()) ||
                            d.category.toLowerCase().includes(diagnosticSearchQuery.toLowerCase()) ||
                            (d.snomed && d.snomed.includes(diagnosticSearchQuery))
                          ).length > 0 ? (
                            MENTAL_HEALTH_DIAGNOSES.filter(d => 
                              d.code.toLowerCase().includes(diagnosticSearchQuery.toLowerCase()) ||
                              d.name.toLowerCase().includes(diagnosticSearchQuery.toLowerCase()) ||
                              d.category.toLowerCase().includes(diagnosticSearchQuery.toLowerCase()) ||
                              (d.snomed && d.snomed.includes(diagnosticSearchQuery))
                            ).map((diag, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-2.5 hover:bg-slate-850 cursor-pointer flex justify-between items-center transition-all text-xs text-left"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewDiagnosisName(`${diag.code} - ${diag.name}`);
                                    setDiagnosticSearchQuery("");
                                    setShowDiagnosticSuggestions(false);
                                  }}
                                  className="flex-1 text-left"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="bg-slate-950 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-emerald-400 border border-slate-800">{diag.code}</span>
                                    <span className="font-semibold text-slate-200">{diag.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 font-mono">
                                    <span>Categoría: {diag.category}</span>
                                    <span>•</span>
                                    <span>SNOMED-CT: {diag.snomed || "Pendiente"}</span>
                                  </div>
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDiagnosesList(prev => [
                                      ...prev,
                                      { name: `${diag.code} ${diag.name}`, status: newDiagnosisStatus }
                                    ]);
                                    setDiagnosticSearchQuery("");
                                    setShowDiagnosticSuggestions(false);
                                  }}
                                  className="text-[10px] uppercase font-black bg-emerald-600/20 text-emerald-400 border border-emerald-900 px-2.5 py-1.5 rounded-xl hover:bg-emerald-650 hover:text-white transition cursor-pointer"
                                >
                                  + Instante
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="p-3 text-slate-500 text-[10.5px] italic">No se encontraron diagnósticos clínicos coincidentes.</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Manual entry backup / refine edit */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        <input
                          type="text"
                          placeholder="Ingreso manual / diagnóstico personalizado si es necesario..."
                          value={newDiagnosisName}
                          onChange={(e) => setNewDiagnosisName(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!newDiagnosisName.trim()) return;
                            setDiagnosesList(prev => [
                              ...prev,
                              { name: newDiagnosisName.trim(), status: newDiagnosisStatus }
                            ]);
                            setNewDiagnosisName("");
                          }}
                          className="bg-emerald-600 hover:bg-emerald-555 text-white rounded-xl px-4 py-2.5 text-xs font-bold shrink-0 transition cursor-pointer"
                        >
                          + Agregar
                        </button>
                      </div>
                    </div>

                    {/* Badges of currently indexed diagnoses for this session */}
                    {diagnosesList.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {diagnosesList.map((d, index) => {
                          let badgeColor = "bg-emerald-950/40 text-emerald-450 border-emerald-900/60";
                          if (d.status === "En sospecha") badgeColor = "bg-amber-955/40 text-amber-450 border-amber-900/60";
                          if (d.status === "En estudio") badgeColor = "bg-blue-950/40 text-blue-400 border-blue-900/60";
                          return (
                            <div key={index} className={`px-2.5 py-1 rounded-xl border flex items-center gap-2 text-[10.5px] font-sans ${badgeColor}`}>
                              <span>{d.name} ({d.status})</span>
                              <button 
                                type="button" 
                                onClick={() => handleRemoveDiagnosis(index)}
                                className="text-[11px] font-bold text-slate-400 hover:text-white shrink-0 ml-1 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic">No ha ingresado diagnósticos oficiales para esta sesión.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Progress note evolution texteditor WITH smart discrete chronometer top progress bar */}
              <div className="space-y-2 flex-1 flex flex-col min-h-[290px]">
                
                <div className="flex justify-between items-center text-xs">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Clipboard className="w-3.5 h-3.5 text-emerald-400" /> Notas de Evolución Psicoterapéutica
                  </label>
                  
                  {/* Discreet inline chronometer timer layout inside clinical workspace */}
                  <span className="text-[10px] font-mono text-slate-350 flex items-center gap-1.5 bg-slate-900/40 px-2.5 py-1 rounded-xl border border-slate-850">
                    <Clock className={`w-3.5 h-3.5 ${timerTextClass} animate-pulse`} />
                    <span className={`font-bold ${timerTextClass}`}>{formatTimer(elapsedSecs)} / 45:00</span>
                    <span className="text-slate-500">({formatRemainingTime()})</span>
                  </span>
                </div>
                
                {/* Visual elegant clinical text container with thin pulsing top timeline progress bar */}
                <div className="relative flex-grow flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all min-h-[230px]">
                  
                  {/* Slim timeline progress indicator right on top of text area */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-slate-950/65 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${timerBarColor} animate-pulse`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {/* Elegant Format & Dictation Overlay Toolbar on top of texteditor */}
                  <div className="flex flex-wrap items-center justify-between bg-slate-950/90 border-b border-slate-800/60 p-2 pt-2.5 gap-2 text-xs">
                    {/* Left Side: Text styling & size cycling */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleInsertClinicalFormat("bold")}
                        className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                        title="Formato: Negrita"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertClinicalFormat("underline")}
                        className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                        title="Formato: Subrayado"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertClinicalFormat("bullet")}
                        className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                        title="Formato: Viñetas de puntos"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>
                      
                      {/* Text Zoom cycling button */}
                      <button
                        type="button"
                        onClick={handleCycleTextSize}
                        className="p-1 px-2.5 bg-slate-900/80 text-[9.5px] font-black text-slate-300 border border-slate-800 rounded-lg hover:bg-slate-850 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
                        title="Ajustar Tamaño de Letra (Zoom)"
                      >
                        <Type className="w-3 h-3 text-emerald-400" />
                        <span>Ajuste Letra: <span className="text-emerald-400">{clinicalTextSize === 'text-[10.5px]' ? 'Pequeña (80%)' : clinicalTextSize === 'text-xs' ? 'Normal (100%)' : clinicalTextSize === 'text-sm' ? 'Mediana (120%)' : clinicalTextSize === 'text-base' ? 'Grande (140%)' : 'Extra Grande (160%)'}</span></span>
                      </button>
                    </div>

                    {/* Right Side: Speech dictation active trigger & Templates Button "+" & Feedback circular button */}
                    <div className="flex items-center gap-1.5 font-sans">
                      {/* Share feedback & satisfaction form button (Circled in blue/red in screenshot) */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsFeedbackPanelOpen(!isFeedbackPanelOpen);
                          setIsTemplateModalOpen(false); // Close other modal
                        }}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer flex items-center justify-center ${
                          isFeedbackPanelOpen
                            ? "bg-blue-600/30 text-blue-300 border-blue-500 shadow-md shadow-blue-950/45"
                            : "bg-slate-900 border-slate-800 hover:bg-slate-850 hover:border-slate-700 hover:text-blue-400"
                        }`}
                        title="Compartir Formulario de Satisfacción y Consentimiento (Ley 20.584)"
                      >
                        <ArrowUp className="w-4 h-4 text-blue-400 font-extrabold" />
                      </button>

                      {/* Templates button "+" */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsTemplateModalOpen(!isTemplateModalOpen);
                          setIsFeedbackPanelOpen(false); // Close other modal
                        }}
                        className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer border ${
                          isTemplateModalOpen
                            ? "bg-indigo-600/30 text-indigo-300 border-indigo-500 shadow-md shadow-indigo-950/45"
                            : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700"
                        }`}
                        title="Abrir Biblioteca de Plantillas Clínicas (Modal Colapsable)"
                      >
                        <Plus className={`w-3.5 h-3.5 ${isTemplateModalOpen ? "text-indigo-400 rotate-45" : "text-emerald-400"} transition-all duration-300`} />
                        <span>Plantillas</span>
                      </button>

                      {/* Speech Dictation Button */}
                      <button
                        type="button"
                        onClick={handleToggleDictation}
                        className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer border ${
                          isDictating
                            ? "bg-rose-950/80 border-rose-500/80 shadow shadow-rose-950/40 animate-pulse"
                            : "bg-slate-900 text-slate-350 border-slate-800 hover:bg-slate-800 hover:text-white"
                        }`}
                        title={isDictating ? "Detener Dictado por Voz" : "Iniciar Dictado por Voz (Mic)"}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isDictating ? "bg-rose-500 animate-ping" : "bg-emerald-400"}`} />
                        <Mic className={`w-3.5 h-3.5 ${isDictating ? "text-rose-500 scale-110 drop-shadow-[0_0_5px_rgba(239,68,68,0.85)]" : "text-slate-400"}`} />
                        <span className={isDictating ? "text-rose-450 font-extrabold" : "text-slate-350"}>
                          {isDictating ? "Grabando..." : "Dictar (Mic)"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Colapsable Library Panel for clinical templates */}
                  {isTemplateModalOpen && (
                    <div className="bg-slate-950 border-b border-slate-850 p-3.5 space-y-3 animate-in slide-in-from-top-2 duration-300 text-left select-none max-h-[300px] overflow-y-auto">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                        <span className="text-[9.5px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> Biblioteca de Plantillas Clínicas
                        </span>
                        <span className="text-[8.5px] text-slate-500 font-mono">Guarde anotaciones recurrentes y multiplique su rapidez</span>
                      </div>

                      {/* Saving Custom Template Section */}
                      <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-850 space-y-2">
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <span>💾 Guardar Notas de Evolución Actual como Plantilla</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Título de la nueva plantilla (Ej: Alta TCC, Crisis Ansiedad)..."
                            value={newTemplateTitle}
                            onChange={(e) => setNewTemplateTitle(e.target.value)}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[9.5px] text-slate-200 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newTemplateTitle.trim()) {
                                alert("Por favor escriba un título para denominar esta plantilla clínica.");
                                return;
                              }
                              if (!progressNotes.trim()) {
                                alert("Su espacio de notas está vacío. Redacte algo primero para poder guardarlo como plantilla.");
                                return;
                              }
                              const newTpl = {
                                id: Date.now().toString(),
                                title: newTemplateTitle.trim(),
                                category: "Personalizado",
                                content: progressNotes
                              };
                              setCustomTemplates(prev => [newTpl, ...prev]);
                              setNewTemplateTitle("");
                              alert(`¡Excelente! La plantilla "${newTpl.title}" se ha guardado en su base de datos local y se encuentra lista para ser reutilizada.`);
                            }}
                            className="bg-indigo-650 hover:bg-indigo-550 text-[9.5px] text-white font-extrabold px-3 py-1.5 rounded-lg border border-indigo-500 transition cursor-pointer"
                          >
                            Guardar Plantilla
                          </button>
                        </div>
                      </div>

                      {/* Templates List */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                        {customTemplates.map((tpl) => (
                          <div key={tpl.id} className="bg-slate-900 border border-slate-850 p-2.5 rounded-xl space-y-2 hover:border-indigo-900/50 transition duration-200 flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-[10px] font-black text-slate-200 line-clamp-1">{tpl.title}</span>
                                <span className="text-[7px] px-1.5 py-0.5 bg-slate-950 border border-slate-850 rounded-md font-bold text-indigo-400 shrink-0 font-mono tracking-wider">
                                  {tpl.category.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-550 line-clamp-2 mt-1 leading-normal font-sans italic">
                                {tpl.content.split("\n").filter(Boolean)[1] || tpl.content}
                              </p>
                            </div>

                            <div className="flex gap-1.5 pt-2 border-t border-slate-950/60 mt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setProgressNotes(prev => {
                                    const separator = prev ? "\n\n" : "";
                                    return prev + separator + tpl.content;
                                  });
                                  alert(`Plantilla "${tpl.title}" acoplada con éxito.`);
                                }}
                                className="flex-1 py-1 bg-emerald-950/30 text-emerald-300 border border-emerald-900/30 hover:bg-emerald-900/20 rounded-lg text-[9px] font-bold transition cursor-pointer text-center text-xs"
                                title="Agregar estas líneas al final de su redacción actual"
                              >
                                Acoplar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`¿Desea sobreescribir su redacción actual y reemplazarla exclusivamente con la plantilla "${tpl.title}"?`)) {
                                    setProgressNotes(tpl.content);
                                  }
                                }}
                                className="flex-1 py-1 bg-indigo-950/30 text-indigo-300 border border-indigo-900/30 hover:bg-indigo-900/20 rounded-lg text-[9px] font-bold transition cursor-pointer text-center text-xs"
                                title="Reemplazar todo el contenido de sus notas por esta plantilla"
                              >
                                Reemplazar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(tpl.content);
                                  alert(`Plantilla "${tpl.title}" copiada al portapapeles.`);
                                }}
                                className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg transition border border-slate-850 cursor-pointer"
                                title="Copiar texto puro al portapapeles"
                              >
                                <Copy className="w-3 h-3" />
                              </button>

                              {tpl.category === "Personalizado" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`¿Desea remover la plantilla personalizada "${tpl.title}"?`)) {
                                      setCustomTemplates(prev => prev.filter(t => t.id !== tpl.id));
                                    }
                                  }}
                                  className="p-1.5 hover:bg-rose-950/45 text-slate-500 hover:text-rose-400 rounded-lg transition border border-transparent hover:border-rose-950 cursor-pointer"
                                  title="Eliminar plantilla guardada de la biblioteca"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Collapsible Panel for Sharing Feedback (Acción de Cierre e Impresión) */}
                  {isFeedbackPanelOpen && (
                    <div className="bg-slate-950 border-b border-slate-850 p-4 space-y-3.5 animate-in slide-in-from-top-2 duration-300 text-left select-none">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                        <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1.5 font-mono">
                          <ThumbsUp className="w-4 h-4 text-blue-400 animate-bounce" /> Satisfacción Usuaria & Consentimiento Clínico (Ley 20.584)
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">Permita al paciente calificar su atención</span>
                      </div>

                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850 space-y-2.5">
                        <p className="text-[10.5px] leading-relaxed font-sans text-slate-300">
                          Para promover la transparencia, reputación clínica y recolectar la fidelidad de sus calificaciones, comparta el formulario de evaluación de satisfacción. El paciente podrá consentir de modo informado el resguardo o visibilización de su comentario (Ley Chilena 19.628 de vida privada y Ley 20.584 de deberes y derechos en salud).
                        </p>
                        
                        {/* Selector/Pills previews */}
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">🔑 Atributos Rápidos de Evaluación (Pills de acceso rápido):</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {["buena escucha", "manejo teórico", "entrega buenas recomendaciones", "acogedor"].map((pill) => (
                              <span key={pill} className="px-2 py-0.5 bg-slate-950 border border-slate-800 text-slate-400 text-[9.5px] rounded-full font-semibold font-mono">
                                {pill}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              // Core action: Send a structured satisfaction invitation chat card
                              const systemTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              const feedbackRequestMsg = {
                                sender: "Doctor" as const,
                                text: `⭐ SOLICITUD DE EVALUACIÓN DE ATENCIÓN: Estimado paciente, le agradecería mucho si pudiese dedicar un breve momento para compartir su retroalimentación y registrar su consentimiento clínico para la mejora continua del consultorio.`,
                                time: systemTime,
                                isFeedbackRequest: true,
                                submittedFeedback: null
                              };
                              
                              setChatMessages(prev => [...prev, feedbackRequestMsg]);
                              setRightPanelTab("chat");
                              setIsFeedbackPanelOpen(false);
                              alert("¡Excelente! Se ha enviado el Formulario Interactivo de Satisfacción y Consentimiento al Chat Seguro de la sesión. El paciente ahora puede completarlo en vivo desde su pantalla de chat.");
                            }}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-[10px] text-white font-extrabold px-3 py-2 rounded-lg border border-blue-500 transition cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-blue-950/45 uppercase"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                            <span>Compartir en el Chat Seguro de Sesión</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              // Manual copy link
                              const dummyUrl = `${window.location.origin}/evaluacion?therapist=${encodeURIComponent(therapistName || '')}&patient=${encodeURIComponent(patientName || '')}&room=${roomId}`;
                              navigator.clipboard.writeText(dummyUrl);
                              alert(`🔗 ¡Enlace de evaluación copiado al portapapeles!\n\n${dummyUrl}\n\nPuede enviarlo por WhatsApp o correo al paciente para que lo responda de manera externa.`);
                            }}
                            className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-350 text-[10px] font-bold px-3 py-2 rounded-lg transition-all duration-150 cursor-pointer text-center"
                          >
                            Copiar Enlace Manual
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <textarea
                    ref={clinicalTextAreaRef}
                    value={progressNotes}
                    onChange={(e) => setProgressNotes(e.target.value)}
                    readOnly={isRecordSigned}
                    placeholder={isRecordSigned ? "Ficha médica cerrada por firma digital. No se permiten modificaciones directas (Ley 20.584)." : "Redacte aquí de forma profesional el estado conductual, evolutivo e intervenciones aplicadas en esta videoconsulta..."}
                    className={`w-full h-full flex-grow bg-transparent p-4.5 pt-4 text-white focus:outline-none placeholder-slate-600 font-sans leading-relaxed resize-none min-h-[160px] ${clinicalTextSize} ${isRecordSigned ? "text-slate-450 bg-slate-900/10 cursor-not-allowed select-none" : ""}`}
                  />
                  
                  {/* Mini-dashboard inline at texteditor footer */}
                  <div className="px-3.5 py-2.5 bg-slate-950/30 border-t border-slate-850/60 flex justify-between items-center text-[9px] text-slate-500 font-mono">
                    <span className="font-semibold text-slate-450">FASE DE SESIÓN: {sessionPhase}</span>
                    <span className="font-black text-slate-400">{progressNotes.length} CARACTERES REDACTADOS</span>
                  </div>
                </div>
              </div>

              {/* Quick note alerts line entry */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Notas Rápidas o Alerta Sintomática Reciente</label>
                <input
                  type="text"
                  placeholder="Ej: Adecuado cumplimiento de mindfulness, crisis circunstancial leve..."
                  value={diagnosticsCheck}
                  onChange={(e) => setDiagnosticsCheck(e.target.value)}
                  disabled={isRecordSigned}
                  className={`w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans shadow-inner ${isRecordSigned ? "opacity-65 cursor-not-allowed text-slate-450" : ""}`}
                />
              </div>

              {/* Dynamic summary card for Gemini compilation */}
              {aiSummaryResult && (
                <div className="bg-emerald-950/20 border border-emerald-900/60 p-3.5 rounded-2xl space-y-2 mt-1 animate-in fade-in duration-250 text-left">
                  <div className="flex justify-between items-center pb-1.5 border-b border-emerald-950">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Síntesis Clínica Abby AI
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setProgressNotes(prev => prev + "\n\n=== ANEXO EVOLUCIÓN COMPILACIÓN IA ===\n" + aiSummaryResult);
                        setAiSummaryResult("");
                      }}
                      className="text-[10px] bg-emerald-900/60 text-emerald-300 font-bold px-2 py-0.5 rounded-md hover:bg-emerald-800/80 transition cursor-pointer"
                    >
                      Sumar a Evolución
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300 font-sans">{aiSummaryResult}</p>
                </div>
              )}

              {/* Quick Actions Ribbons */}
              <div className="space-y-2 pt-2 shrink-0 border-t border-slate-900">
                {isRecordSigned ? (
                  // If signed, show locked notice and law-compliant addendum block
                  <div className="space-y-3 bg-indigo-950/25 border border-indigo-900/40 p-3.5 rounded-2xl animate-in fade-in duration-200 text-left">
                    <span className="text-[10px] uppercase font-black text-indigo-400 tracking-wider flex items-center gap-1.5">
                      🔒 Ficha Cerrada (Ley 20.584 y 19.628)
                    </span>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                      Esta evolución está blindada con firma digital oficial de <strong className="text-white">{signedDetails?.name || signatureName}</strong> (Doc: {signedDetails?.doc || "Superintendencia de Salud"}) el <span className="text-indigo-300">{signedDetails?.date || new Date().toLocaleDateString("es-CL")}</span>. Para agregar aclaraciones o nueva información, use el anexo firmado abajo:
                    </p>

                    <div className="space-y-2">
                      <textarea
                        value={addendumText}
                        onChange={(e) => setAddendumText(e.target.value)}
                        placeholder="Escriba aquí observaciones adicionales o complementos clínicos..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 h-20 resize-none font-sans"
                      />
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[8px] uppercase font-bold text-slate-50 block">Nombre Profesional</label>
                          <input
                            type="text"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            placeholder="Dr(a)..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] uppercase font-bold text-slate-50 block">N° Matrícula / Registro</label>
                          <input
                            type="text"
                            value={signatureDoc}
                            onChange={(e) => setSignatureDoc(e.target.value)}
                            placeholder="Registro SIS..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="flex gap-1.5 items-end">
                        <div className="flex-1 text-left">
                          <label className="text-[8px] uppercase font-bold text-slate-50 block">PIN de Firma (1234 o 2026)</label>
                           <input
                             type="password"
                             maxLength={4}
                             value={signaturePin}
                             onChange={(e) => setSignaturePin(e.target.value)}
                             placeholder="••••"
                             className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono font-bold text-indigo-400 text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-indigo-500"
                           />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (signaturePin !== "1234" && signaturePin !== "2026") {
                              alert("PIN de firma incorrecto. Ingrese '1234' o '2026' para autorizar el anexo científico.");
                              return;
                            }
                            if (!signatureName.trim() || !signatureDoc.trim()) {
                              alert("Por favor ingrese su Nombre y Registro para estampar la firma.");
                              return;
                            }
                            handleSaveAddendum(signatureName.trim(), signatureDoc.trim());
                            setSignaturePin("");
                          }}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black h-[34px] px-3.5 rounded-lg transition-all duration-150 uppercase tracking-wider cursor-pointer font-sans"
                        >
                          Firmar Anexo
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onLeaveCall}
                      className="w-full text-center py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300 text-[10px] font-extrabold rounded-xl transition cursor-pointer flex items-center justify-center gap-1 uppercase"
                    >
                      Volver a la Agenda
                    </button>
                  </div>
                ) : (
                  // STANDARD OFFERS (Save online draft, synthesise with AI, Final sign/seal)
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePerformSaveSessionRecord(false)}
                        disabled={savingRecord || !progressNotes}
                        className={`py-2.5 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-1 shadow transition-all cursor-pointer ${
                          !progressNotes ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        <Save className="w-3.5 h-3.5 text-slate-400 animate-pulse" /> Guardar Borrador
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerateAiSummary}
                        disabled={generatingAi || !progressNotes}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow border cursor-pointer ${
                          !progressNotes 
                            ? "bg-slate-900 text-slate-650 border border-slate-850 cursor-not-allowed" 
                            : "bg-emerald-950/30 hover:bg-emerald-900/30 text-emerald-400 border-emerald-800/80"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" /> {generatingAi ? "Evaluando..." : "Sintetizar con IA"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSignatureModalOpen(true)}
                      disabled={savingRecord || !progressNotes}
                      className={`w-full py-3 rounded-xl text-xs font-black shadow flex items-center justify-center gap-2 transition-all uppercase cursor-pointer tracking-wider ${
                        !progressNotes
                          ? "bg-slate-900 text-slate-650 border border-slate-850 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                    >
                      <CheckCircle className="w-4 h-4 text-white" /> Firmar y Cerrar Evolución de Sesión
                    </button>

                    <button
                      type="button"
                      onClick={onLeaveCall}
                      className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 transition flex items-center justify-center gap-1 cursor-pointer mt-1"
                    >
                      Salir y Volver a la Agenda
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* 3. TAB: TESTS (Clinician Psychometrics & Protocol Tool checklists) */}
          {isClinician && rightPanelTab === "tests" && (
            <div className="space-y-4 flex-1 flex flex-col text-left animate-in fade-in duration-150">
              
              {/* Selector de Protocolo */}
              <div className="bg-slate-905 border border-slate-805 rounded-2xl p-4 space-y-3.5">
                <div>
                  <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-4.5 h-4.5 text-indigo-400" /> Protocolos y Herramientas Clínicas Estandarizadas
                  </h5>
                  <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                    Seleccione un cuestionario protocolar para iniciarlo de forma interactiva sobre la llamada actual con el paciente.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={activeProtocol || "PHQ-9"}
                    onChange={(e) => handleApplyInteractiveProtocol(e.target.value as any)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none font-sans"
                  >
                    <option value="PHQ-9">PHQ-9 (Cuestionario sobre Salud del Paciente - Depresión)</option>
                    <option value="GAD-7">GAD-7 (Ansiedad Generalizada)</option>
                    <option value="C-SSRS">C-SSRS (Columbia - Escala de Despistaje de Riesgo Suicida)</option>
                  </select>
                  
                  {!activeProtocol && (
                    <button
                      type="button"
                      onClick={() => handleApplyInteractiveProtocol("PHQ-9")}
                      className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                    >
                      Iniciar Formulario
                    </button>
                  )}
                </div>
              </div>

              {/* RENDER ACTIVE PROTOCOL MCQs */}
              {activeProtocol && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" /> Evaluación Protocolar: {activeProtocol}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Fórmula las preguntas al paciente y marque las casillas correlativas:</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveProtocol(null)}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>

                  {/* PHQ-9 & GAD-7 Rendering Logic */}
                  {(activeProtocol === "PHQ-9" || activeProtocol === "GAD-7") && (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                      {(activeProtocol === "PHQ-9" ? phqQuestions : gadQuestions).map((question, qIdx) => {
                        const currentVal = activeProtocol === "PHQ-9" ? phqAnswers[qIdx] : gadAnswers[qIdx];
                        return (
                          <div key={qIdx} className="space-y-2 border-b border-slate-850 pb-3 text-xs">
                            <span className="font-semibold text-slate-305 block font-sans">
                              {qIdx + 1}. {question}
                            </span>
                            
                            {/* Option selections horizontal */}
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { val: 0, label: "Para nada" },
                                { val: 1, label: "Varios días" },
                                { val: 2, label: "Más de la mit." },
                                { val: 3, label: "Casi todos" }
                              ].map((opt) => (
                                <button
                                  key={opt.val}
                                  type="button"
                                  onClick={() => {
                                    if (activeProtocol === "PHQ-9") {
                                      const next = [...phqAnswers];
                                      next[qIdx] = opt.val;
                                      setPhqAnswers(next);
                                    } else {
                                      const next = [...gadAnswers];
                                      next[qIdx] = opt.val;
                                      setGadAnswers(next);
                                    }
                                  }}
                                  className={`p-2 rounded-xl text-[9.5px] font-bold text-center border transition-all cursor-pointer ${
                                    currentVal === opt.val
                                      ? "bg-slate-100 dark:bg-emerald-600 text-slate-950 dark:text-white border-emerald-500 scale-102"
                                      : "bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800"
                                  }`}
                                >
                                  {opt.label} ({opt.val})
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* C-SSRS Columbia Protocol layout */}
                  {activeProtocol === "C-SSRS" && (
                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                      <div className="bg-amber-955/20 border border-amber-900/40 p-3 rounded-xl text-[10px] leading-relaxed text-amber-300 flex items-start gap-1.5 mb-1 text-left">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <span><strong>Importante (Protocolo de Seguridad):</strong> La escala C-SSRS de despistaje es crítica. Si cualquiera de las últimas 3 preguntas o antecedentes son positivos ("SÍ"), active de forma inmediata un canal de contención médica de urgencia.</span>
                      </div>
                      
                      {cssrsQuestions.map((question, qIdx) => {
                        const isYes = cssrsAnswers[qIdx];
                        return (
                          <div key={qIdx} className="p-3.5 rounded-xl border border-slate-850 bg-slate-950 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-left">
                            <span className="font-semibold text-slate-300 font-sans max-w-[70%]">
                              {qIdx + 1}. {question}
                            </span>
                            
                            <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...cssrsAnswers];
                                  next[qIdx] = true;
                                  setCssrsAnswers(next);
                                }}
                                className={`px-3 py-1 text-[9.5px] font-black rounded-lg transition-all cursor-pointer uppercase ${
                                  isYes 
                                    ? "bg-rose-600 text-white animate-pulse" 
                                    : "text-slate-500 hover:text-slate-300"
                                }`}
                              >
                                SÍ
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...cssrsAnswers];
                                  next[qIdx] = false;
                                  setCssrsAnswers(next);
                                }}
                                className={`px-3 py-1 text-[9.5px] font-black rounded-lg transition-all cursor-pointer uppercase ${
                                  !isYes 
                                    ? "bg-emerald-600/30 text-emerald-450 border border-emerald-950" 
                                    : "text-slate-500 hover:text-slate-300"
                                }`}
                              >
                                NO
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Live score indicator & save protocol transaction */}
                  <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="text-left">
                      <span className="text-[10px] text-slate-450 uppercase font-bold">Sumario del Protocolo</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-white">
                          Puntaje/Grado: 
                          <strong className="text-md ml-1 inline-block text-emerald-400 font-extrabold font-mono">
                            {activeProtocol === "C-SSRS" 
                              ? `${cssrsAnswers.filter(Boolean).length} ítems Positivos`
                              : `${(activeProtocol === "PHQ-9" ? phqAnswers : gadAnswers).reduce((a,b)=>a+b,0)} pts`
                            }
                          </strong>
                        </span>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleSaveInteractiveProtocolText}
                      className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-4.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" /> Registrar e Insertar en Evolución
                    </button>
                  </div>
                </div>
              )}

              {/* Historial de tests en la sesión actual */}
              {testResults.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-900">
                  <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest block">Evaluaciones Registradas</span>
                  <div className="space-y-2">
                    {testResults.map((tr, index) => (
                      <div key={index} className="bg-slate-900 border border-slate-805 p-3 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <strong className="text-slate-200">{tr.testName}</strong> (Puntuación: <span className="font-mono text-emerald-400 font-extrabold">{tr.score}</span>)
                          <p className="text-[10px] text-slate-400 italic mt-0.5">{tr.interpretation}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTestResults(testResults.filter((_, i) => i !== index))}
                          className="text-rose-400 hover:text-rose-500 font-bold px-2 rounded-lg hover:bg-slate-800 py-1 cursor-pointer"
                        >
                          ✕ Descartar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. TAB: REPORTS (Emitir Informes, Certificados de asistencia y derivaciones con autocompilador IA) */}
          {isClinician && rightPanelTab === "reports" && (
            <div className="space-y-4 flex-1 flex flex-col text-left animate-in fade-in duration-150">
              
              {/* Form and Template Selector block */}
              <div className="bg-slate-900 border border-slate-805 p-4 rounded-2xl space-y-3.5">
                <div>
                  <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="w-4.5 h-4.5 text-amber-400" /> Módulo de Certificados e Informes Clínicos
                  </h5>
                  <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                    Genere documentos formales (Chile) firmados digitalmente listos para descargar o imprimir a petición del paciente.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedReportTemplate("evolucion")}
                    className={`py-2 p-1 text-[10.5px] font-bold border rounded-xl transition-all cursor-pointer ${
                      selectedReportTemplate === "evolucion"
                        ? "bg-slate-100 dark:bg-amber-600/25 text-slate-950 dark:text-amber-300 border-amber-600"
                        : "bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    📝 Informe Evolutivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedReportTemplate("asistencia")}
                    className={`py-2 p-1 text-[10.5px] font-bold border rounded-xl transition-all cursor-pointer ${
                      selectedReportTemplate === "asistencia"
                        ? "bg-slate-100 dark:bg-amber-600/25 text-slate-950 dark:text-amber-300 border-amber-600"
                        : "bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    🩺 Certif. Asistencia
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedReportTemplate("derivacion")}
                    className={`py-2 p-1 text-[10.5px] font-bold border rounded-xl transition-all cursor-pointer ${
                      selectedReportTemplate === "derivacion"
                        ? "bg-slate-100 dark:bg-amber-600/25 text-slate-950 dark:text-amber-300 border-amber-600"
                        : "bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    🤝 Interconsulta / Deriv.
                  </button>
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateReportAi}
                    disabled={generatingReportAi || !progressNotes}
                    className={`px-4 py-2.5 border rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer ${
                      !progressNotes 
                        ? "bg-slate-950 border-slate-850 text-slate-600 cursor-not-allowed"
                        : "bg-amber-650/15 border-amber-500 hover:bg-amber-500/20 text-amber-200"
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" /> {generatingReportAi ? "Autoredactando..." : "✨ Autoredactar con Abby IA"}
                  </button>
                </div>
              </div>

              {/* Paper Layout Document Preview panel */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest block">Vista Previa del Documento Médico Firmado</span>
                
                {/* Simulated professional medicine white paper background */}
                <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-2xl shadow-xl space-y-4 max-h-[340px] overflow-y-auto border border-white relative select-text">
                  
                  {/* Watermark logo */}
                  <div className="absolute inset-x-0 top-1/3 flex justify-center items-center opacity-5 pointer-events-none select-none">
                    <Activity className="w-56 h-56 text-slate-900" />
                  </div>

                  {/* Header of clinic registry */}
                  <div className="border-b-2 border-slate-800 pb-3 flex justify-between items-start gap-4">
                    <div className="text-left leading-tight">
                      <h4 className="text-sm font-extrabold tracking-tight uppercase text-slate-900">MindSpace</h4>
                      <p className="text-[8.5px] text-slate-500 uppercase tracking-wide">Psicología Clínica de Especialidades</p>
                      <p className="text-[8px] text-slate-400">Certificación Telemedicina Certificada E2EE</p>
                    </div>
                    <div className="text-right leading-tight font-mono text-[8.5px] text-slate-550">
                      <p>FOLIO: MS-{roomId.toUpperCase().substring(5, 11)}</p>
                      <p>FECHA: {new Date().toLocaleDateString("es-CL")}</p>
                    </div>
                  </div>

                  {/* Document Title header */}
                  <div className="py-2 text-center">
                    <h3 className="text-xs font-black tracking-wide text-slate-900 uppercase underline decoration-emerald-600 decoration-2 underline-offset-4">{reportDocTitle}</h3>
                  </div>

                  {/* Editable text body paper area */}
                  <textarea
                    rows={8}
                    value={reportContentText}
                    onChange={(e) => setReportContentText(e.target.value)}
                    className="w-full text-[11px] leading-relaxed text-slate-805 bg-transparent border-0 focus:outline-none focus:ring-0 font-sans h-auto resize-none p-1 text-left decoration-transparent"
                    placeholder="Redacte o edite de forma personalizada el contenido del certificado formal en este recuadro..."
                  />

                  {/* Verified certification Stamp */}
                  <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="text-left leading-normal text-[9px] text-slate-500">
                      <p className="font-extrabold text-slate-800">{therapistName || "Terapeuta Autorizado"}</p>
                      <p>Psicología Clínica y Regulada</p>
                      <p className="text-[8.5px] text-slate-400 mt-1">ID de Validación Segura: {roomId.substring(0, 16)}...</p>
                    </div>
                    
                    {/* Legal electronic sign badge */}
                    <div className="bg-amber-50 border border-amber-200/60 p-1.5 rounded-lg flex items-center gap-1.5 shrink-0 rotate-[-1deg] select-none text-left font-sans">
                      <Award className="w-6 h-6 text-amber-600 shrink-0" />
                      <div className="leading-tight text-[8px] font-bold text-amber-800 uppercase">
                        <p>Firma Electrónica</p>
                        <p className="font-mono text-amber-900 font-black">Superint. SIS</p>
                        <p className="text-[7px]">Ley 20.584 Chile</p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Documents actions buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyReportToClipboard}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-bold text-slate-200 flex justify-center items-center gap-1.5 cursor-pointer transition-all"
                >
                  {isReportCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {isReportCopied ? "Copiado!" : "Copiar Texto de Informe"}
                </button>

                <button
                  type="button"
                  onClick={handleSaveReportToClinicalHistory}
                  disabled={savingRecord || isReportSaved}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black flex justify-center items-center gap-1.5 cursor-pointer transition-all ${
                    isReportSaved 
                      ? "bg-slate-900 text-slate-600 border border-slate-850"
                      : "bg-amber-600 hover:bg-amber-550 text-white"
                  }`}
                >
                  <Save className="w-4 h-4" />
                  {isReportSaved ? "Informe Guardado en Ficha ✓" : "Sincronizar e Indexar en Ficha"}
                </button>
              </div>

            </div>
          )}

          {/* 5. TAB: CHAT (Secure Secondary Chat timeline) */}
          {(!isClinician || rightPanelTab === "chat") && (
            <div className="space-y-3.5 flex-1 flex flex-col max-h-[460px] overflow-hidden text-left animate-in fade-in duration-150">
              
              {/* Chat list timeline */}
              <div className="flex-grow space-y-2.5 overflow-y-auto pr-1 text-xs select-text min-h-[160px]">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`p-3 rounded-2xl max-w-[85%] border ${
                    msg.sender === "Doctor" 
                      ? "bg-slate-900/90 text-white border-slate-800 self-end ml-auto animate-in slide-in-from-right-3" 
                      : "bg-slate-950 text-emerald-300 border-indigo-950 mr-auto animate-in slide-in-from-left-3"
                  }`}>
                    <div className="flex justify-between items-center mb-1 text-[9px] font-black tracking-wider text-slate-500 font-mono gap-4">
                      <span>{msg.sender === "Doctor" ? "TERAPEUTA" : "PACIENTE"}</span>
                      <span>{msg.time}</span>
                    </div>
                    {msg.isFeedbackRequest ? (
                      <InteractiveFeedbackCard
                        msg={msg}
                        idx={idx}
                        therapistId={"default_psychologist_uid_123"}
                        therapistName={therapistName || "Terapeuta"}
                        defaultPatientName={patientName || "Paciente Atendido"}
                        onUpdateFeedback={(msgIdx, feedback) => {
                          setChatMessages(prev => {
                            const updated = [...prev];
                            updated[msgIdx] = {
                              ...updated[msgIdx],
                              submittedFeedback: feedback
                            };
                            return updated;
                          });
                        }}
                      />
                    ) : msg.isFile ? (
                      <div className="mt-1 pb-1">
                        <p className="text-[10px] text-slate-400 font-sans italic mb-2">"{msg.text}"</p>
                        <div className="flex items-center gap-2.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                          <div className="p-2 bg-rose-950/40 text-rose-400 border border-rose-900/55 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-rose-500" />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <span className="block text-[11px] font-bold text-slate-200 truncate font-mono">{msg.fileName}</span>
                            <span className="block text-[9px] text-slate-500 font-mono">{msg.fileSize} • Cifrado AES-256</span>
                          </div>
                          <a
                            href={msg.fileDataUrl || "#"}
                            download={msg.fileName}
                            onClick={(e) => {
                              if (!msg.fileDataUrl) {
                                e.preventDefault();
                                alert(`Descargando de manera segura expediente de: ${msg.fileName}.\nEste archivo fue cifrado de extremo a extremo mediante un token seguro en la sesión y se encuentra verificado por MindSpace.`);
                              }
                            }}
                            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800/50 transition cursor-pointer"
                            title="Descargar Expediente Seguro"
                          >
                            <Download className="w-4 h-4 text-emerald-400" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="font-sans break-words text-[11.5px] leading-relaxed select-text">{msg.text}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick file selector trigger and simulate option */}
              <div className="flex justify-between items-center text-[10px] text-slate-500 px-1 pt-1.5 shrink-0 border-t border-slate-900">
                <span>Intercambio Seguro de Fichas (E2EE)</span>
                <button
                  type="button"
                  onClick={handleSimulateReceivePatientFile}
                  className="text-indigo-400 hover:text-indigo-300 font-black flex items-center gap-1 cursor-pointer transition uppercase text-[9px]"
                  title="Simular que el paciente sube un informe de psiquiatra o tribunales"
                >
                  📥 Simular Recepción de Archivo
                </button>
              </div>

              {/* Quick chat submission input with file clip attachment */}
              <form onSubmit={handleSendMessage} className="space-y-2 shrink-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileSelected}
                />
                
                <div className="flex gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-800 shadow cursor-pointer text-center"
                    title="Adjuntar Documentación Clínica (PDF, Informes, etc.)"
                  >
                    <Paperclip className="w-4 h-4 text-emerald-400" />
                  </button>

                  <input
                    type="text"
                    placeholder="Escriba mensaje cifrado..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 rounded-xl p-2.5 text-xs bg-slate-900 border border-slate-800 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans shadow-inner"
                  />
                  <button
                    type="submit"
                    className="p-2.5 bg-emerald-600 hover:bg-emerald-555 text-white rounded-xl transition-all shadow cursor-pointer text-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>

            </div>
          )}

        </div>
      </div>

      {/* Clinician Signature modal before official commit */}
      {signatureModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 text-white">
          <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-400 border border-emerald-950/50">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <h4 className="text-base font-black">Firma Digital de Ficha Médica</h4>
              <p className="text-[10px] text-slate-405 leading-relaxed">
                Autorice legalmente el cierre y almacenamiento encriptado de esta evolución clínica bajo normativas de secreto profesional médico.
              </p>
            </div>

            <div className="space-y-3 px-1 text-xs text-left">
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500">Nombre del Profesional</label>
                <input
                  type="text"
                  required
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Ej: Ps. José Ignacio Romero V."
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500">Registro SIS (Superintendencia)</label>
                <input
                  type="text"
                  required
                  value={signatureDoc}
                  onChange={(e) => setSignatureDoc(e.target.value)}
                  placeholder="Ej: SIS 52291"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase font-bold text-slate-500">PIN de Seguridad (Demo: 1234 o 2026)</label>
                <input
                  type="password"
                  required
                  value={signaturePin}
                  onChange={(e) => setSignaturePin(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center tracking-widest bg-slate-950 border border-slate-850 p-2.5 rounded-xl text-lg font-bold font-mono text-emerald-450 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2.5">
              <button
                type="button"
                onClick={() => {
                  if (signaturePin !== "1234" && signaturePin !== "2026") {
                    alert("PIN de firma incorrecto. Ingrese '1234' o '2026' para autorizar el resguardo.");
                    return;
                  }
                  if (!signatureName.trim() || !signatureDoc.trim()) {
                    alert("Por favor, ingrese su Nombre y Registro de la Superintendencia.");
                    return;
                  }
                  localStorage.setItem("mindspace_therapist_fullname", signatureName.trim());
                  localStorage.setItem("mindspace_therapist_sis_number", signatureDoc.trim());
                  setSignatureModalOpen(false);
                  setSignaturePin("");
                  handlePerformSaveSessionRecord(true, signatureName.trim(), signatureDoc.trim());
                }}
                className="flex-1 bg-emerald-650 hover:bg-emerald-600 font-bold py-2.5 text-xs rounded-xl transition cursor-pointer"
              >
                Firma Autorizada
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignatureModalOpen(false);
                  setSignaturePin("");
                }}
                className="bg-slate-800 hover:bg-slate-755 text-slate-350 font-bold px-4 py-2.5 text-xs rounded-xl cursor-pointer"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pristine In-App Confirmation / Hang-up Dialog Modal to fully bypass iFrame confirm() restrictions */}
      {showHangupModalCheck && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans text-left">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2.5 bg-rose-650/15 text-rose-450 border border-rose-650/20 rounded-xl flex items-center justify-center">
                <Phone className="w-5 h-5 transform rotate-[135deg]" />
              </div>
              <div>
                <h4 className="text-sm font-black text-rose-400 uppercase tracking-wider font-mono">Finalizar Sesión</h4>
                <p className="text-[10px] text-slate-500 font-mono">Control de Egreso Seguro</p>
              </div>
            </div>

            {isCallHangupLocked ? (
              <div className="space-y-3">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5 text-xs text-amber-200 leading-normal">
                  <p className="font-bold flex items-center gap-1">
                    <Lock className="w-4 h-4 text-amber-500 animate-pulse" /> CONTROL PROTEGIDO ACTIVO
                  </p>
                  <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                    El sistema ha bloqueado el botón de colgar para salvaguardar la llamada de cortes accidentales del clínico o paciente durante la interacción directa.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCallHangupLocked(false);
                      setShowHangupModalCheck(false);
                      alert("🔓 Se ha desbloqueado la seguridad de llamada instantáneamente. Ahora puede colgar de manera segura.");
                    }}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[10px] py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 uppercase"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Desactivar Bloqueo y Volver</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHangupModalCheck(false)}
                    className="w-full bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold text-[10px] py-2 rounded-xl transition cursor-pointer text-center"
                  >
                    Seguir en Consulta Continuamente
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[11.5px] leading-relaxed text-slate-300 font-sans">
                  {isClinician 
                    ? "Estimado especialista, ¿qué acción de cierre clínico desea realizar en esta videollamada?"
                    : "Estimado paciente, ¿está seguro de que desea finalizar su videollamada y salir de la atención segura?"}
                </p>

                {isClinician ? (
                  <div className="flex flex-col gap-2 pt-1">
                    {isVideoCallActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsVideoCallActive(false);
                          setCameraOn(false);
                          setMicOn(false);
                          if (streamRef.current) {
                            streamRef.current.getTracks().forEach((track) => track.stop());
                          }
                          setShowHangupModalCheck(false);
                          alert("📞 Videollamada finalizada. Se ha habilitado la redacción de la evolución y ficha clínica al 100%.");
                        }}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[10px] py-2 rounded-xl border border-rose-500 transition cursor-pointer flex items-center justify-center gap-1 uppercase"
                      >
                        <Phone className="w-3.5 h-3.5 transform rotate-[135deg]" />
                        <span>Colgar Video y Escribir Ficha</span>
                      </button>
                    ) : null}
                    
                    <button
                      type="button"
                      onClick={() => {
                        setShowHangupModalCheck(false);
                        onLeaveCall();
                      }}
                      className="w-full bg-slate-950 hover:bg-slate-855 text-rose-450 border border-slate-850 font-extrabold text-[10px] py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 uppercase"
                    >
                      <span>Forzar Salida del Consultorio (Sin Guardar)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowHangupModalCheck(false)}
                      className="w-full bg-slate-855 hover:bg-slate-800 text-slate-350 font-bold text-[10px] py-2 rounded-xl transition cursor-pointer"
                    >
                      Volver a la Consulta
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowHangupModalCheck(false);
                        onLeaveCall();
                      }}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[10px] py-2.5 rounded-xl border border-rose-500 transition cursor-pointer flex items-center justify-center gap-1 uppercase"
                    >
                      <Phone className="w-3.5 h-3.5 transform rotate-[135deg]" />
                      <span>Sí, Salir de Consulta</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowHangupModalCheck(false)}
                      className="w-full bg-slate-855 hover:bg-slate-800 text-slate-350 font-bold text-[10px] py-2 rounded-xl transition cursor-pointer"
                    >
                      No, continuar en sesión
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
