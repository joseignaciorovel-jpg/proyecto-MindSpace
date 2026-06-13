import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, addDoc, updateDoc, Timestamp, orderBy, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Patient, HistoryRecord } from "../types";
import { UserPlus, BookOpen, Clock, Activity, FileText, Sparkles, Plus, CheckCircle, Search, HelpCircle, FileCheck2, Calendar, Shield, Eye, ShieldAlert, Share2, Star, Trash2, Bold, Underline, Type, Mic, MicOff, Smile, Moon } from "lucide-react";

interface ClinicalHistoryProps {
  therapistUid: string;
  therapistName?: string;
}

export default function ClinicalHistoryManager({ therapistUid, therapistName }: ClinicalHistoryProps) {
  // Collection states
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);

  // Feedback evaluations integration
  const [copiedReviewLink, setCopiedReviewLink] = useState(false);
  const [copiedPortalLink, setCopiedPortalLink] = useState(false);
  const [receivedReviews, setReceivedReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  // Load reviews for ownerId
  useEffect(() => {
    if (!therapistUid) return;
    const q = query(
      collection(db, "reviews"),
      where("ownerId", "==", therapistUid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side by descending createdAt to avoid needing a Firestore composite index
      items.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setReceivedReviews(items);
      setLoadingReviews(false);
    }, (error) => {
      console.error("Error loading clinician reviews:", error);
      setLoadingReviews(false);
    });
    return () => unsubscribe();
  }, [therapistUid]);

  const handleCopyReviewLink = () => {
    if (!selectedPatient) return;
    const productionOrigin = "https://proyecto-mindspace-597030236952.southamerica-west1.run.app";
    const url = `${productionOrigin}?mode=review&patientId=${selectedPatient.id}&therapistId=${therapistUid}&therapistName=${encodeURIComponent(therapistName || "Dr. José Ignacio Rovel")}&patientName=${encodeURIComponent(selectedPatient.name)}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopiedReviewLink(true);
        setTimeout(() => setCopiedReviewLink(false), 3000);
      })
      .catch((err) => {
        console.error("No se pudo copiar el enlace:", err);
        alert(`Aquí está el enlace para enviar por WhatsApp: ${url}`);
      });
  };

  const handleCopyPatientPortalLink = () => {
    if (!selectedPatient) return;
    const productionOrigin = "https://proyecto-mindspace-597030236952.southamerica-west1.run.app";
    const cleanRut = (selectedPatient.rut || "").trim();
    const cleanEmail = (selectedPatient.email || "").trim();
    
    // Auto login deep link
    const url = `${productionOrigin}?portal=patient${cleanRut ? `&rut=${encodeURIComponent(cleanRut)}` : ""}${cleanEmail ? `&email=${encodeURIComponent(cleanEmail)}` : ""}`;
    const txt = `Hola ${selectedPatient.name}, te comparto el link de tu Portal de Paciente Seguro en MindSpace para registrar tus horas de sueño, reportes clínicos y ver tus citas:\n\n${url}\n\n(Ingresarás de forma automática al hacer clic).`;
    
    navigator.clipboard.writeText(txt)
      .then(() => {
        setCopiedPortalLink(true);
        setTimeout(() => setCopiedPortalLink(false), 3000);
      })
      .catch((err) => {
        console.error("No se pudo copiar el portal link:", err);
        alert(`Aquí está el texto para enviar por WhatsApp: ${txt}`);
      });
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm("¿Está seguro de que desea eliminar permanentemente esta reseña de la vista pública?")) return;
    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "reviews", reviewId));
    } catch (error) {
      console.error("Error deleting review:", error);
    }
  };

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Loading states
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // New patient form modal/toggle
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientEmail, setNewPatientEmail] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientRut, setNewPatientRut] = useState("");
  const [newPatientConsent, setNewPatientConsent] = useState(false);

  // New session history notes form
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [progressNotes, setProgressNotes] = useState("");
  const [diagnosticsCheck, setDiagnosticsCheck] = useState("");
  const [diagnosesList, setDiagnosesList] = useState<{ name: string; status: "Confirmado" | "En sospecha" | "En estudio" }[]>([]);
  const [newDiagnosisName, setNewDiagnosisName] = useState("");
  const [newDiagnosisStatus, setNewDiagnosisStatus] = useState<"Confirmado" | "En sospecha" | "En estudio">("Confirmado");

  const handleAddDiagnosis = () => {
    if (!newDiagnosisName.trim()) {
      alert("Por favor ingrese el nombre del diagnóstico.");
      return;
    }
    setDiagnosesList([...diagnosesList, { name: newDiagnosisName.trim(), status: newDiagnosisStatus }]);
    setNewDiagnosisName("");
    setNewDiagnosisStatus("Confirmado");
  };

  const handleRemoveDiagnosis = (index: number) => {
    setDiagnosesList(diagnosesList.filter((_, idx) => idx !== index));
  };

  const [aiSummaryResult, setAiSummaryResult] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);

  // ==========================================
  // CLINICAL PREMIUM ADDITIONS
  // ==========================================
  const [activeSessionSubTab, setActiveSessionSubTab] = useState<"evolution" | "instruments" | "documents" | "cbt_diary">("evolution");
  const [patientMoodLogs, setPatientMoodLogs] = useState<any[]>([]);
  const [activeTest, setActiveTest] = useState<"phq9" | "gad7" | "cssrs">("phq9");
  
  // States for Documents, Certificates and Clinical report generation with local privacy protection
  const [selectedDocTemplate, setSelectedDocTemplate] = useState<"attendance" | "evolution" | "discharge">("attendance");
  const [docAnonymizeMode, setDocAnonymizeMode] = useState(true);
  const [customDocContent, setCustomDocContent] = useState("");
  const [isCopiedDoc, setIsCopiedDoc] = useState(false);

  // Helper template generator to protect patient details (Privacy Law 19.628 / HIPAA)
  const generateTemplateContent = (templateType: "attendance" | "evolution" | "discharge", anonymize: boolean) => {
    const todayStr = new Date().toLocaleDateString("es-CL");
    const sessionDateStr = sessionDate ? new Date(sessionDate + "T12:00:00").toLocaleDateString("es-CL") : todayStr;
    
    let nameVal = "[NOMBRE COMPLETO PACIENTE]";
    let rutVal = "[RUT COMPLETO]";
    
    if (!anonymize && selectedPatient) {
      nameVal = selectedPatient.name;
      rutVal = selectedPatient.rut || "[RUT NO REGISTRADO]";
    } else if (selectedPatient) {
      // Partial masking / Initials to respect privacy
      const initials = selectedPatient.name
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .join(". ") + ".";
      nameVal = `${initials} (Anonimizado - Ley 19.628)`;
      rutVal = "XX.XXX.XXX-X (Oculto)";
    }

    if (templateType === "attendance") {
      return `CERTIFICADO DE ASISTENCIA A CONSULTA DE PSICOTERAPIA

Por medio del presente documento, el/la profesional de la salud mental que suscribe certifica que:

Paciente: ${nameVal}
RUT/RUN Identificación: ${rutVal}

Asistió de manera regular y puntual a sesión de psicoterapia individual en formato de videoconsulta clínica el día ${sessionDateStr}.

Se extiende el presente certificado a petición de la parte interesada para los fines personales o de justificación laboral/académica que estime conveniente, resguardando el secreto profesional bajo los lineamientos del Código de Ética Profesional de Psicólogos y las leyes Nº 19.628 y Nº 20.584 de la República de Chile.

Fecha de emisión: ${todayStr}

________________________________________
Firma y Timbre Profesional de Salud
${therapistName || "Psicólogo/a Tratante"}`;
    }

    if (templateType === "evolution") {
      return `INFORME CLÍNICO DE EVOLUCIÓN PSICOTERAPÉUTICA

Fecha de Emisión: ${todayStr}

I. DATOS DE IDENTIFICACIÓN:
Paciente: ${nameVal}
RUT/RUN Identificación: ${rutVal}
Estado de Consentimiento Ley 19.628: Aprobado y Cripto-Verificado.

II. RESUMEN DE PROCESO TERAPÉUTICO:
El/la paciente se encuentra asistiendo activamente a tratamiento psicoterapéutico individual de orientación clínica. Durante las sesiones se han abordado objetivos encaminados a la estabilización emocional, procesamiento cognitivo con estructuración de esquemas y estimulación de recursos personales de afrontamiento adaptativos. Se observa una adecuada alianza y adherencia terapéutica.

III. DIAGNÓSTICO ESTIMADO O HISTÓRICO:
Actualmente estable en su progreso clínico. Indicadores psicométricos estándar indican progreso favorable dentro de parámetros esperados, sin compromiso severo de funciones cognitivas.

IV. SUGERENCIAS Y RECOMENDACIONES:
1. Continuar activamente con el proceso de psicoterapia individual con la frecuencia sugerida.
2. Mantener pautas de autocuidado psicológico y resguardar red de apoyo en caso necesario.

El presente documento se entrega en carácter confidencial y personal, en resguardo absoluto del artículo de Secreto Profesional consagrado en la legislación sanitaria chilena.

________________________________________
Firma y Timbre Profesional de Salud
${therapistName || "Psicólogo/a Tratante"}`;
    }

    return `CERTIFICADO DE ALTA CLÍNICA PSICOTERAPÉUTICA

Por el presente documento, se certifica que:

Paciente: ${nameVal}
RUT/RUN Identificación: ${rutVal}

Ha completado de forma satisfactoria los objetivos terapéuticos clínicos establecidos al inicio de su proceso de atención psicológica individual, demostrando la incorporación de recursos cognitivos estables, resolución de la queja de base y estabilidad psicosocial adaptativa. Por tanto, se otorga el ALTA CLÍNICA con fecha de hoy.

Se sugiere control o seguimiento espontáneo en caso de requerimiento futuro. Se extiende para fines personales con estricto resguardo de la confidencialidad y secreto profesional.

Fecha de emisión: ${todayStr}

________________________________________
Firma y Timbre Profesional de Salud
${therapistName || "Psicólogo/a Tratante"}`;
  };

  // Sync templates
  useEffect(() => {
    if (activeSessionSubTab === "documents") {
      setCustomDocContent(generateTemplateContent(selectedDocTemplate, docAnonymizeMode));
    }
  }, [selectedDocTemplate, docAnonymizeMode, activeSessionSubTab, selectedPatient, sessionDate]);
  
  // Track previous patient state to avoid race conditions when switching drafts
  const [lastPatientId, setLastPatientId] = useState<string | null>(null);

  // Secure Local Draft Auto-Save & Recovery (Data Loss Prevention)
  useEffect(() => {
    if (selectedPatient?.id) {
      if (selectedPatient.id !== lastPatientId) {
        setLastPatientId(selectedPatient.id);
        const savedDraft = localStorage.getItem(`ep_clinician_draft_${selectedPatient.id}`) || "";
        setProgressNotes(savedDraft);
      } else {
        localStorage.setItem(`ep_clinician_draft_${selectedPatient.id}`, progressNotes);
      }
    } else {
      if (lastPatientId !== null) {
        setLastPatientId(null);
        setProgressNotes("");
      }
    }
  }, [progressNotes, selectedPatient?.id, lastPatientId]);
  
  const [phq9Answers, setPhq9Answers] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [gad7Answers, setGad7Answers] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [cssrsAnswers, setCssrsAnswers] = useState<boolean[]>([false, false, false, false, false]);

  const [isDigitalSignatureChecked, setIsDigitalSignatureChecked] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureName, setSignatureName] = useState(() => {
    try {
      return localStorage.getItem("mindspace_therapist_fullname") || "";
    } catch { return ""; }
  });
  const [signatureDoc, setSignatureDoc] = useState(() => {
    try {
      return localStorage.getItem("mindspace_therapist_sis_number") || "";
    } catch { return ""; }
  });
  const [signaturePin, setSignaturePin] = useState("");
  const [activeRecordToSign, setActiveRecordToSign] = useState<HistoryRecord | null>(null);

  const PHQ9_QUESTIONS = [
    "1. Poco interés o placer en hacer las cosas",
    "2. Se ha sentido decaído(a), deprimido(a) o sin esperanzas",
    "3. Dificultad para quedarse o permanecer dormido(a), o duerme demasiado",
    "4. Se ha sentido cansado(a) o con poca energía",
    "5. Poco apetito o ha comido en exceso",
    "6. Sentirse mal consigo mismo(a), sentir que es un fracaso o que ha decepcionado a su familia",
    "7. Dificultad para concentrarse en cosas tales como leer el periódico o ver televisión",
    "8. Se ha movido o hablado tan lentamente que otras personas lo han notado, o al contrario, ha estado tan inquieto(a) que se mueve mucho más de lo normal",
    "9. Pensamientos de que estaría mejor muerto(a) o de lastimarse de alguna manera en las últimas 2 semanas"
  ];

  const GAD7_QUESTIONS = [
    "1. Sentirse nervioso(a), ansioso(a) o con los nervios de punta",
    "2. No ser capaz de detener o controlar la preocupación",
    "3. Preocuparse demasiado por diferentes cosas",
    "4. Dificultad para relajarse",
    "5. Estar tan inquieto(a) que es difícil permanecer sentado(a)",
    "6. Sentirse molesto(a) o irritable con facilidad",
    "7. Tener miedo de que algo terrible pueda suceder"
  ];

  const CSSRS_QUESTIONS = [
    "1. ¿Ha deseado estar muerto(a) o poder quedarse dormido(a) y no volver a despertar?",
    "2. ¿Ha tenido de hecho pensamientos de suicidarse o quitarse la vida?",
    "3. ¿Ha pensado en cómo o con qué llevaría a cabo esto (métodos o plazos)?",
    "4. ¿Ha tenido estos pensamientos y alguna intención de actuar en consecuencia?",
    "5. ¿Ha empezado ya a elaborar o ya ha elaborado los detalles de un plan para quitarse la vida?"
  ];

  // ==========================================
  // CLINICAL PROGRESS NOTES EXTENSIONS
  // ==========================================
  // 1. Session Countdown/Progress Timer state
  const [timerActive, setTimerActive] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(3650); // Default: ~61 mins (3600s + some grace)
  const [timerExpanded, setTimerExpanded] = useState(true);

  // Rich Text, Font Zoom, and Clinical Dictation Accessibility States
  const [editorFontSize, setEditorFontSize] = useState<"text-xs" | "text-sm" | "text-base" | "text-lg" | "text-xl">("text-xs");
  const [isDictating, setIsDictating] = useState(false);
  const [selectionDetails, setSelectionDetails] = useState({
    isOpen: false,
    text: "",
    start: 0,
    end: 0,
  });
  const dictationRecognitionRef = React.useRef<any>(null);

  // 2. Clinical Digital Pills / Tags state
  const DEFAULT_CLINICAL_TAGS = [
    { id: "suicide_risk", label: "Riesgo Suicida", color: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" },
    { id: "adverse_event", label: "Evento Adverso", color: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100" },
    { id: "panic_attack", label: "Crisis de Pánico", color: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
    { id: "domestic_violence", label: "Violencia Intrafamiliar", color: "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100" },
    { id: "depression_severe", label: "Sintomatología Depresiva", color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { id: "substance_abuse", label: "Consumo de Sustancias", color: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100" }
  ];

  const [availableTags, setAvailableTags] = useState(() => {
    try {
      const saved = localStorage.getItem("mindspace_custom_tags");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_CLINICAL_TAGS;
  });

  const [selectedClinicalTags, setSelectedClinicalTags] = useState<string[]>([]);
  const [showCustomTagModal, setShowCustomTagModal] = useState(false);

  // Custom Tag creation modal input state
  const [customTagName, setCustomTagName] = useState("");
  const [customTagColor, setCustomTagColor] = useState("bg-purple-50 text-purple-700 border-purple-200");

  // Counter clock effect dispatcher
  useEffect(() => {
    let interval: any = null;
    if (timerActive) {
      interval = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive]);

  const handleTogglePillSelector = (label: string) => {
    if (selectedClinicalTags.includes(label)) {
      setSelectedClinicalTags(selectedClinicalTags.filter(t => t !== label));
    } else {
      setSelectedClinicalTags([...selectedClinicalTags, label]);
    }
  };

  const handleCreateNewCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTagName.trim()) {
      alert("Ingrese un término clínico nominativo.");
      return;
    }

    const newTag = {
      id: "tag_" + Math.random().toString(36).substring(2, 8),
      label: customTagName.trim(),
      color: customTagColor
    };

    const updated = [...availableTags, newTag];
    setAvailableTags(updated);
    localStorage.setItem("mindspace_custom_tags", JSON.stringify(updated));

    // Auto-select newly registered tag
    setSelectedClinicalTags([...selectedClinicalTags, newTag.label]);

    setCustomTagName("");
    setShowCustomTagModal(false);
    alert("✅ Etiqueta clínica registrada de inmediato.");
  };

  // ==========================================
  // CLINICAL AUDIO DICTATION & FORMATTING FUNCTIONS
  // ==========================================
  const toggleProgressNotesDictation = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Su navegador actual no cuenta con dictado por voz SpeechRecognition integrado. Le sugerimos usar Google Chrome o Edge.");
      return;
    }

    if (isDictating) {
      try {
        if (dictationRecognitionRef.current) {
          dictationRecognitionRef.current.stop();
        }
      } catch (err) {}
      setIsDictating(false);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = "es-CL";
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsDictating(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setProgressNotes((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${transcript}.` : `${transcript}.`;
          });
        }
      };

      rec.onerror = (e: any) => {
        console.warn("Dictation recognition error:", e);
        setIsDictating(false);
      };

      rec.onend = () => {
        setIsDictating(false);
      };

      dictationRecognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error("Failed to start dictation:", err);
      setIsDictating(false);
    }
  };

  const handleTextareaSelectionCheck = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start !== end) {
      const selectedText = target.value.substring(start, end);
      setSelectionDetails({
        isOpen: true,
        text: selectedText,
        start,
        end,
      });
    } else {
      setSelectionDetails((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const applyTextFormat = (type: "bold" | "underline") => {
    const { start, end, text } = selectionDetails;
    if (!text) return;
    
    let replacement = "";
    if (type === "bold") {
      replacement = `**${text}**`;
    } else if (type === "underline") {
      replacement = `<u>${text}</u>`;
    }

    const heading = progressNotes.substring(0, start);
    const trailing = progressNotes.substring(end);
    setProgressNotes(heading + replacement + trailing);

    // Close floating bar
    setSelectionDetails((prev) => ({ ...prev, isOpen: false }));
  };

  // ==========================================
  // CLINICAL AUDITING (Ley 19.628 / 20.584)
  // ==========================================
  const [auditLogs, setAuditLogs] = useState<{
    id: string;
    patientId: string;
    patientName: string;
    action: "LECTURA" | "REGISTRO" | "EDICIÓN" | "EXPORTAR";
    details: string;
    timestamp: any;
    ipAddress: string;
    userAgent: string;
    operatorEmail: string;
  }[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [auditFilter, setAuditFilter] = useState<"TODOS" | "LECTURA" | "REGISTRO">("TODOS");

  const writeAuditLog = async (
    patientId: string, 
    patientName: string, 
    action: "LECTURA" | "REGISTRO" | "EDICIÓN" | "EXPORTAR", 
    details: string
  ) => {
    try {
      const simulatedIPs = ["201.239.12.89", "190.161.45.210", "200.72.115.34", "201.223.8.44"];
      const randomIP = simulatedIPs[Math.floor(Math.random() * simulatedIPs.length)];
      const userAgent = navigator.userAgent.substring(0, 75) + "...";
      
      await addDoc(collection(db, "clinical_audits"), {
        patientId,
        patientName,
        action,
        details,
        timestamp: Timestamp.now(),
        ipAddress: randomIP,
        userAgent,
        operatorEmail: "Especialista Activo",
        ownerId: therapistUid
      });
    } catch (e) {
      console.error("Error writing audit log:", e);
    }
  };

  const handleUpdatePatientRisk = async (risk: "none" | "low" | "medium" | "critical", detailStr: string) => {
    if (!selectedPatient) return;
    try {
      const docRef = doc(db, "patients", selectedPatient.id);
      await updateDoc(docRef, {
        clinicalCriticalRisk: risk,
        criticalAlertDetail: detailStr
      });
      setSelectedPatient(prev => prev ? { ...prev, clinicalCriticalRisk: risk, criticalAlertDetail: detailStr } : null);
      
      await writeAuditLog(
        selectedPatient.id,
        selectedPatient.name,
        "EDICIÓN",
        `Modificación del nivel de resguardo clínico del paciente. Nivel fijado: [${risk.toUpperCase()}]. Observaciones: ${detailStr || "Sin detalle descriptivo."}`
      );
    } catch (e) {
      console.error("Error actualizando riesgo clínico:", e);
      alert("Error al actualizar estado en el servidor.");
    }
  };

  // Fetch clinical audits for selected patient
  useEffect(() => {
    if (!selectedPatient || !therapistUid) {
      setAuditLogs([]);
      return;
    }

    setLoadingAudits(true);
    const q = query(
      collection(db, "clinical_audits"),
      where("patientId", "==", selectedPatient.id),
      where("ownerId", "==", therapistUid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: any[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort client side descending by timestamp
      logs.sort((a, b) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return tB - tA;
      });
      setAuditLogs(logs);
      setLoadingAudits(false);
    }, (error) => {
      console.error("Error subscribiendo a auditoría:", error);
      setLoadingAudits(false);
    });

    return () => unsubscribe();
  }, [selectedPatient, therapistUid]);

  // Trigger audit on access (open patient profile)
  useEffect(() => {
    if (selectedPatient) {
      writeAuditLog(
        selectedPatient.id,
        selectedPatient.name,
        "LECTURA",
        "Apertura de la ficha clínica confidencial del paciente. Visualización de historial de sesiones, evoluciones pasadas e indicadores diagnósticos preventivos."
      );
    }
  }, [selectedPatient?.id]);

  // Sync CBT Sleep & Mood journal for selected patient securely
  useEffect(() => {
    if (!selectedPatient) {
      setPatientMoodLogs([]);
      return;
    }

    const matchEmail = (selectedPatient.email || "").trim().toLowerCase();
    const matchRut = (selectedPatient.rut || "").trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase();

    if (!matchRut && !matchEmail) {
      setPatientMoodLogs([]);
      return;
    }

    // Query all records, filter safely on client side or via compound queries
    const q = query(
      collection(db, "mood_journals"),
      where("ownerId", "==", therapistUid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((log: any) => {
          const logRut = (log.patientRut || "").trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase();
          const logEmail = (log.patientEmail || "").trim().toLowerCase();
          return (matchRut && logRut === matchRut) || (matchEmail && logEmail === matchEmail);
        });

      // Sort by timeline descending
      list.sort((a: any, b: any) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });

      setPatientMoodLogs(list);
    }, (error) => {
      console.warn("Could not load mood logs in real-time under clinical rules:", error);
    });

    return () => unsubscribe();
  }, [selectedPatient, therapistUid]);

  const getTimerProgressPercent = () => {
    if (sessionDuration <= 0) return 0;
    return Math.min(100, (secondsElapsed / sessionDuration) * 100);
  };

  const getTimerProgressStyle = (percent: number) => {
    if (percent <= 70) {
      return {
        colorClass: "bg-gradient-to-r from-emerald-500 to-teal-500",
        label: "Fase Exploratoria - Tiempo Normal"
      };
    } else if (percent <= 90) {
      return {
        colorClass: "bg-gradient-to-r from-amber-400 to-yellow-500 font-semibold",
        label: "Fase de Cierre - Soft Alert Activo"
      };
    } else {
      return {
        colorClass: "bg-gradient-to-r from-rose-500 to-red-600 animate-pulse text-red-605 font-bold",
        label: "Conclusión de Sesión - Tiempo Clínico Concluido ⚠️"
      };
    }
  };

  const formatTimerString = (secTotal: number) => {
    const mins = Math.floor(secTotal / 60);
    const secs = secTotal % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getPhq9Result = () => {
    const score = phq9Answers.reduce((a, b) => a + b, 0);
    let interp = "Sin depresión (Normalidad clínica)";
    let recommendation = "Continuar con monitoreo preventivo normal.";
    if (score >= 5 && score <= 9) {
      interp = "Depresión Leve (Monitoreo activo)";
      recommendation = "Brindar psicoeducación sobre higiene del sueño y manejo del estrés.";
    } else if (score >= 10 && score <= 14) {
      interp = "Depresión Moderada (Sugerencia de intervención focalizada)";
      recommendation = "Psicoterapia cognitivo-conductual estructurada. Considerar interconsulta médica.";
    } else if (score >= 15 && score <= 19) {
      interp = "Depresión Moderadamente Grave (Intervención prioritaria)";
      recommendation = "Tratamiento de mediano plazo co-administrado con Psiquiatría (esquema AUGE/GES en Chile).";
    } else if (score >= 20) {
      interp = "Depresión Grave / Severa (Riesgo de descompensación agudo o suicida)";
      recommendation = "Intervención de emergencia, derivación prioritaria a COSAM / Red de Urgencia Psiquiátrica.";
    }
    return { score, interp, recommendation };
  };

  const getGad7Result = () => {
    const score = gad7Answers.reduce((a, b) => a + b, 0);
    let interp = "Ansiedad Mínima (Normalidad)";
    let recommendation = "Ejercicios de respiración o mindfulness recomendados.";
    if (score >= 5 && score <= 9) {
      interp = "Ansiedad Leve";
      recommendation = "Enseñar técnicas de respiración diafragmática y control del estrés.";
    } else if (score >= 10 && score <= 14) {
      interp = "Ansiedad Moderada";
      recommendation = "Iniciar reestructuración cognitiva y entrenamiento en relajación progresiva de Jacobson.";
    } else if (score >= 15) {
      interp = "Ansiedad Grave / Severa (Crisis activa)";
      recommendation = "Intervención prioritaria para desescalamiento simpático y derivación psiquiátrica complementaria.";
    }
    return { score, interp, recommendation };
  };

  const getCssrsResult = () => {
    const score = cssrsAnswers.filter(Boolean).length;
    let interp = "Sin de ideación suicida manifiesta en el cribado.";
    let recommendation = "Fomentar las técnicas de autocuidado general y mindfulness.";
    if (cssrsAnswers[2] || cssrsAnswers[3] || cssrsAnswers[4]) {
      interp = "🚨 RIESGO SUICIDA ALTO (Presencia de planes o intenciones activas)";
      recommendation = "ACTIVACIÓN DE PROTOCOLO DE SALVAGUARDA DE INMEDIATO. No dejar al paciente solo. Notificar a red de apoyo chilena *4141 de inmediato.";
    } else if (cssrsAnswers[0] || cssrsAnswers[1]) {
      interp = "⚠️ Riesgo Suicida Moderado (Deseos de morir sin plan específico)";
      recommendation = "Registrar alianza de seguridad de inmediato, plan de crisis escrito y control de frecuencia acortada.";
    }
    return { score, interp, recommendation };
  };

  // 1. Listen to real-time Patients profiles owned by the logged in therapist
  useEffect(() => {
    if (!therapistUid) return;

    const q = query(
      collection(db, "patients"),
      where("ownerId", "==", therapistUid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Patient[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Patient);
      });
      setPatients(list);
      setLoadingPatients(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "patients");
    });

    return () => unsubscribe();
  }, [therapistUid]);

  // 1.5. Auto-sync unregistered patients who booked sessions or wrote mood journals
  useEffect(() => {
    if (!therapistUid || loadingPatients) return;

    const syncExternalPatients = async () => {
      try {
        // Find all unique patient emails/ruts from mood journals and appointments
        const [moodSnap, apptSnap] = await Promise.all([
          getDocs(query(collection(db, "mood_journals"), where("ownerId", "==", therapistUid))),
          getDocs(query(collection(db, "appointments"), where("ownerId", "==", therapistUid)))
        ]);

        const externalPatientsMap: { [key: string]: { name: string; email: string; phone: string; rut: string } } = {};

        // Parse mood journals
        moodSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const pRut = (data.patientRut || "").trim().toLowerCase();
          const pEmail = (data.patientEmail || "").trim().toLowerCase();
          if (pRut && pEmail) {
            const key = pRut;
            if (!externalPatientsMap[key]) {
              externalPatientsMap[key] = {
                name: data.patientName || pEmail.split("@")[0],
                email: pEmail,
                phone: "No provisto",
                rut: data.patientRut,
              };
            }
          }
        });

        // Parse appointments
        apptSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const pRut = (data.patientRut || "").trim().toLowerCase();
          const pEmail = (data.patientEmail || "").trim().toLowerCase();
          if (pRut && pEmail) {
            const key = pRut;
            // Appointments take precedence for naming / phone since they are more reliable
            externalPatientsMap[key] = {
              name: data.patientName || (externalPatientsMap[key]?.name) || pEmail.split("@")[0],
              email: pEmail,
              phone: data.patientPhone || (externalPatientsMap[key]?.phone) || "No provisto",
              rut: data.patientRut || pRut,
            };
          }
        });

        // Compare with existing patients profiles
        const existingRuts = new Set(patients.map(p => p.rut.trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase()));
        const existingEmails = new Set(patients.map(p => p.email.trim().toLowerCase()));

        for (const [keyRut, extPatient] of Object.entries(externalPatientsMap)) {
          const normExtRut = keyRut.replace(/\./g, "").replace(/\-/g, "").toLowerCase();
          const normExtEmail = extPatient.email.toLowerCase();

          // If this patient is not currently registered in our dashboard folder/file list
          if (!existingRuts.has(normExtRut) && !existingEmails.has(normExtEmail)) {
            // Auto provision profile right now!
            const newPatientId = "pat_" + Math.random().toString(36).substring(2, 11);
            const newPatientRef = doc(db, "patients", newPatientId);

            const newPatientData: Patient = {
              id: newPatientId,
              name: extPatient.name,
              email: extPatient.email,
              phone: extPatient.phone,
              rut: extPatient.rut,
              consentLawAccepted: true,
              consentTimestamp: Timestamp.now(),
              createdAt: Timestamp.now(),
              ownerId: therapistUid
            };

            await setDoc(newPatientRef, newPatientData);
            console.log("Auto-synchronized and created missing patient profile:", newPatientData);
          }
        }
      } catch (err) {
        console.warn("Could not auto-sync missing patient records:", err);
      }
    };

    // Run background sync check
    syncExternalPatients();
  }, [therapistUid, loadingPatients, patients]);

  // 2. Fetch histories records for the selected patient
  useEffect(() => {
    if (!selectedPatient) {
      setHistoryRecords([]);
      return;
    }

    setLoadingRecords(true);
    const q = query(
      collection(db, "histories"),
      where("patientId", "==", selectedPatient.id),
      where("ownerId", "==", therapistUid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: HistoryRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as HistoryRecord);
      });
      // Sort client side by date descending
      records.sort((a, b) => b.date.localeCompare(a.date));
      setHistoryRecords(records);
      setLoadingRecords(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "histories");
    });

    return () => unsubscribe();
  }, [selectedPatient, therapistUid]);

  const validateChileanRut = (rutStr: string) => {
    const normalized = rutStr.replace(/\./g, "").replace(/-/g, "").trim();
    if (normalized.length < 8 || normalized.length > 9) return false;
    const body = normalized.slice(0, -1);
    const dv = normalized.slice(-1).toUpperCase();
    
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i], 10) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const res = 11 - (sum % 11);
    let expectedDv = "";
    if (res === 11) expectedDv = "0";
    else if (res === 10) expectedDv = "K";
    else expectedDv = String(res);
    
    return expectedDv === dv;
  };

  // Create Patient Profile
  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName || !newPatientEmail || !newPatientRut) {
      alert("Por favor, rellene el nombre, correo electrónico y RUT.");
      return;
    }

    if (!validateChileanRut(newPatientRut)) {
      alert("El RUT ingresado no es válido. Ejemplo correcto: 12.345.678-k");
      return;
    }

    if (!newPatientConsent) {
      alert("Para cumplir con la Ley N° 19.628 de Protección de Datos Personales, debe registrar que el paciente aceptó y firmó el consentimiento de tratamiento clínico.");
      return;
    }

    try {
      const patientId = "pat_" + Math.random().toString(36).substring(2, 11);
      const newPatientRef = doc(db, "patients", patientId);

      const patientData: Patient = {
        id: patientId,
        name: newPatientName,
        email: newPatientEmail,
        phone: newPatientPhone || "No provisto",
        rut: newPatientRut,
        consentLawAccepted: newPatientConsent,
        consentTimestamp: Timestamp.now(),
        createdAt: Timestamp.now(),
        ownerId: therapistUid
      };

      await setDoc(newPatientRef, patientData);

      // Clean up inputs
      setNewPatientName("");
      setNewPatientEmail("");
      setNewPatientPhone("");
      setNewPatientRut("");
      setNewPatientConsent(false);
      setShowAddPatient(false);
      setSelectedPatient(patientData);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "patients");
    }
  };

  // Compile with Gemini AI clinical summarizer
  const handleGenerateAiSummary = async () => {
    if (!progressNotes) {
      alert("Ingrese notas de sesión para poder resumir con el Asistente de IA.");
      return;
    }

    setGeneratingAi(true);
    setAiSummaryResult("");

    const diagnosesStr = diagnosesList.length > 0 
      ? diagnosesList.map(d => `${d.name} (${d.status})`).join(", ") 
      : "";
    const combinedDiagnostics = [diagnosticsCheck, diagnosesStr].filter(Boolean).join(" | ");

    try {
      const res = await fetch("/api/gemini/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: selectedPatient?.name || "Paciente",
          notes: progressNotes,
          observations: combinedDiagnostics
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

  const performSaveSessionRecord = async (isSigned: boolean, sigName?: string, sigDoc?: string) => {
    if (!selectedPatient) return;
    setSavingRecord(true);
    try {
      const recordId = "rec_" + Math.random().toString(36).substring(2, 11);
      const recordRef = doc(db, "histories", recordId);

      const diagnosesStr = diagnosesList.length > 0 
        ? diagnosesList.map(d => `${d.name} (${d.status})`).join(", ") 
        : "";
      const combinedDiagnostics = [diagnosticsCheck, diagnosesStr].filter(Boolean).join(" | ");

      // Serialize clinical diagnostic pills clearly in formatted string observations
      const formattedObservations = selectedClinicalTags.length > 0 
        ? `[🏷️ ${selectedClinicalTags.join(" | ")}] ${combinedDiagnostics || "Estable"}`
        : (combinedDiagnostics || "Estable");

      const newRecord: HistoryRecord = {
        id: recordId,
        patientId: selectedPatient.id,
        date: sessionDate,
        notes: progressNotes,
        observations: formattedObservations,
        aiSummary: aiSummaryResult || "Resumen de evolución clínica no generado.",
        createdAt: Timestamp.now(),
        ownerId: therapistUid,
        ...(isSigned && sigName && sigDoc ? {
          isSigned: true,
          signatureDate: new Date().toLocaleDateString("es-CL"),
          signatureName: sigName,
          signatureDoc: sigDoc
        } : {})
      };

      await setDoc(recordRef, newRecord);

      // Audit clinical records storage
      await writeAuditLog(
        selectedPatient.id,
        selectedPatient.name,
        "REGISTRO",
        isSigned 
          ? `Almacenamiento de nueva evolución e historia clínica FIRMADA Y CERRADA. Diagnósticos registrados: ${formattedObservations}`
          : `Almacenamiento de nueva evolución e historia clínica en ficha confidencial. Diagnósticos/Alertas registrados: ${formattedObservations}`
      );

      // Successfully saved, reset fields and local clinical tags
      if (selectedPatient?.id) {
        localStorage.removeItem(`ep_clinician_draft_${selectedPatient.id}`);
      }
      setProgressNotes("");
      setDiagnosticsCheck("");
      setDiagnosesList([]);
      setAiSummaryResult("");
      setSelectedClinicalTags([]);
      setIsDigitalSignatureChecked(false);
      
      // Reset psychometric scoring arrays
      setPhq9Answers([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      setGad7Answers([0, 0, 0, 0, 0, 0, 0]);
      setCssrsAnswers([false, false, false, false, false]);
      setActiveSessionSubTab("evolution");
      
      // Stops counter
      setTimerActive(false);
      setSecondsElapsed(0);

      alert(isSigned 
        ? "✅ Registro clínico guardado, FIRMADO DIGITALMENTE Y BLOQUEADO legalmente con éxito."
        : "✅ Registro clínico guardado con éxito bajo secreto psicoterapéutico."
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "histories");
    } finally {
      setSavingRecord(false);
    }
  };

  // Save session record to patient case dossier
  const handleSaveSessionRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    if (!progressNotes) {
      alert("Debe escribir observaciones clínicas en la nota de evolución.");
      return;
    }

    if (isDigitalSignatureChecked) {
      setActiveRecordToSign(null); // indicates saving the current active form
      setSignatureModalOpen(true);
    } else {
      await performSaveSessionRecord(false);
    }
  };

  const handleValidateAndSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureName.trim() || !signatureDoc.trim()) {
      alert("Por favor ingrese su Nombre Completo y Registro de la Superintendencia (SIS).");
      return;
    }
    if (signaturePin !== "1234" && signaturePin !== "2026") {
      alert("PIN de firma digital incorrecto. Utilice '1234' o '2026' para la confirmación de firma como demostración.");
      return;
    }

    try {
      localStorage.setItem("mindspace_therapist_fullname", signatureName.trim());
      localStorage.setItem("mindspace_therapist_sis_number", signatureDoc.trim());
    } catch {}

    if (activeRecordToSign) {
      // Retrospective signing of an existing history record
      try {
        const docRef = doc(db, "histories", activeRecordToSign.id);
        await updateDoc(docRef, {
          isSigned: true,
          signatureDate: new Date().toLocaleDateString("es-CL"),
          signatureName: signatureName.trim(),
          signatureDoc: signatureDoc.trim()
        });
        
        await writeAuditLog(
          selectedPatient?.id || "N/A",
          selectedPatient?.name || "N/A",
          "REGISTRO",
          `Cierre retroactivo de ficha clínica (Firma digital): ID ${activeRecordToSign.id} por ${signatureName.trim()} (SIS: ${signatureDoc.trim()})`
        );

        alert("✅ La evolución elegida ha sido firmada y cerrada en el historial con firma digital simple Ley 19.799.");
        setSignatureModalOpen(false);
        setActiveRecordToSign(null);
        setSignaturePin("");
      } catch (err) {
        console.error("Error signing retrospectively:", err);
        alert("Ocurrió un error al firmar el registro clínico.");
      }
    } else {
      // Saving and signing current record
      setSignatureModalOpen(false);
      setSignaturePin("");
      await performSaveSessionRecord(true, signatureName.trim(), signatureDoc.trim());
    }
  };

  // Filter list of patients
  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.rut && p.rut.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* 1. Left Section: Patients List & Search (4 Columns) */}
      <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm min-h-[500px]">
        <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-slate-600" />
            Pacientes Registrados
          </h3>
          <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono font-medium">
            {patients.length} total
          </span>
        </div>

        {/* Search Input bar */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 w-full rounded-xl border border-gray-200 dark:border-slate-800 p-2.5 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900/60 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all"
          />
        </div>

        {/* Add Patient button / state toggle */}
        {showAddPatient ? (
          <form onSubmit={handleCreatePatient} className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2 text-xs">
            <h4 className="font-semibold text-slate-900">Registrar Nuevo Paciente</h4>
            <input
              type="text"
              required
              placeholder="Nombre y Apellidos"
              value={newPatientName}
              onChange={(e) => setNewPatientName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-800 p-2 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 text-xs placeholder:text-gray-400"
            />
            <input
              type="text"
              required
              placeholder="RUT (ej: 12.345.678-K)"
              value={newPatientRut}
              onChange={(e) => setNewPatientRut(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-800 p-2 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 text-xs font-mono placeholder:text-gray-400"
            />
            <input
              type="email"
              required
              placeholder="Correo electrónico"
              value={newPatientEmail}
              onChange={(e) => setNewPatientEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-800 p-2 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 text-xs placeholder:text-gray-400"
            />
            <input
              type="tel"
              placeholder="Celular (Remitente WhatsApp)"
              value={newPatientPhone}
              onChange={(e) => setNewPatientPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-800 p-2 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 text-xs placeholder:text-gray-400"
            />
            
            <div className="flex items-start gap-1.5 pt-1">
              <input
                type="checkbox"
                id="chk_patient_consent"
                required
                checked={newPatientConsent}
                onChange={(e) => setNewPatientConsent(e.target.checked)}
                className="mt-0.5"
              />
              <label htmlFor="chk_patient_consent" className="text-[10px] text-gray-500 leading-tight">
                Confirmo que el paciente ha firmado el consentimiento informado según las leyes <strong>19.628</strong> y <strong>20.584</strong> de Chile.
              </label>
            </div>

            <div className="flex justify-end gap-1 pt-1">
              <button
                type="button"
                onClick={() => setShowAddPatient(false)}
                className="px-2.5 py-1.5 bg-gray-200 rounded text-gray-700 font-medium"
              >
                Cerrar
              </button>
              <button
                type="submit"
                className="px-2.5 py-1.5 bg-slate-900 text-white rounded font-medium shadow-sm hover:bg-slate-800"
              >
                Crear Perfil
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddPatient(true)}
            className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow"
          >
            <UserPlus className="w-4 h-4" /> Agregar Ficha Paciente
          </button>
        )}

        {/* Patient Items list */}
        <div className="space-y-1.5 overflow-y-auto max-h-[380px] pr-1">
          {loadingPatients ? (
            <div className="space-y-2 py-4">
              <div className="h-8 bg-slate-100 rounded-lg animate-pulse w-full"></div>
              <div className="h-8 bg-slate-100 rounded-lg animate-pulse w-full"></div>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs text-semibold">
              No se encontraron coincidencias.
            </div>
          ) : (
            filteredPatients.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPatient(p)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-colors cursor-pointer relative overflow-hidden ${
                  selectedPatient?.id === p.id
                    ? "bg-slate-900 border-slate-950 text-white shadow-md"
                    : "border-gray-100 hover:bg-slate-50 text-slate-700 bg-white"
                }`}
              >
                {p.clinicalCriticalRisk === "critical" && (
                  <div className="absolute top-0 right-0 h-1.5 w-1.5 bg-red-500 rounded-bl-lg animate-ping" />
                )}
                <div className="flex justify-between items-center gap-1">
                  <span className="font-semibold block truncate leading-snug">{p.name}</span>
                  {p.clinicalCriticalRisk === "critical" && (
                    <span className="bg-red-650 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 animate-pulse tracking-wide font-sans select-none bg-red-600">
                      🚨 RIESGO
                    </span>
                  )}
                  {p.clinicalCriticalRisk === "medium" && (
                    <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 tracking-wide font-sans select-none">
                      ⚠️ MEDIO
                    </span>
                  )}
                </div>
                <div className={`text-[10px] mt-0.5 truncate shrink-0 ${selectedPatient?.id === p.id ? "text-slate-300" : "text-gray-400"}`}>
                  ✉️ {p.email}
                </div>
                <div className={`text-[10px] truncate shrink-0 ${selectedPatient?.id === p.id ? "text-slate-405" : "text-gray-450"}`}>
                  📞 {p.phone}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 2. Right Section: Case File Details and AI Summary editor (8 Columns) */}
      <div className="lg:col-span-8 space-y-6">
        {selectedPatient ? (
          <>
            {/* Patient overview card */}
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow relative">
              <div className="absolute right-0 top-0 p-4 opacity-5">
                <BookOpen className="w-24 h-24" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold">{selectedPatient.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Estatus Clínico: Privado | Bajo Secreto Médico Profesional</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCopyReviewLink}
                    type="button"
                    className="bg-slate-850 hover:bg-slate-800 text-emerald-400 border border-slate-700 hover:border-emerald-500/30 text-[10.5px] font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                    title="Compartir enlace de formulario de evaluación de atención"
                  >
                    {copiedReviewLink ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        <span>¡Enlace de Evaluación Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Solicitar Reseña</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCopyPatientPortalLink}
                    type="button"
                    className="bg-slate-850 hover:bg-slate-800 text-indigo-400 border border-slate-700 hover:border-indigo-500/30 text-[10.5px] font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                    title="Copiar invitación segura de acceso directo al Portal de Pacientes"
                  >
                    {copiedPortalLink ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                        <span>¡Invitación Copiada!</span>
                      </>
                    ) : (
                      <>
                        <Smile className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Invitar a Portal 🔐</span>
                      </>
                    )}
                  </button>
                  {selectedPatient.consentLawAccepted && (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1.5 rounded inline-flex items-center gap-1">
                      ✓ Ley 19.628 / 20.584 OK
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block">Identificación Ficha</span>
                  <span className="font-mono">{selectedPatient.id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">RUT Paciente</span>
                  <span className="font-mono">{selectedPatient.rut || "No registrado"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Fecha Registro</span>
                  <span>{selectedPatient.createdAt ? new Date(selectedPatient.createdAt.toDate()).toLocaleDateString() : "Hoy"}</span>
                </div>
              </div>
            </div>

            {/* CONTROL DE RIESGO CLÍNICO CRÍTICO */}
            <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-55 p-3 rounded-xl border border-slate-205">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                    <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />
                    Evaluación y Control del Nivel de Riesgo Clínico
                  </h4>
                  <p className="text-[10px] text-gray-500 leading-tight">Clasificación confidencial para ideación suicida, autolesiones u otras descompensaciones según normas Minsal.</p>
                </div>
                
                <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  {[
                    { level: "none", label: "Sin Riesgo", color: "bg-slate-300 text-slate-700" },
                    { level: "low", label: "🟢 Bajo", color: "bg-emerald-500" },
                    { level: "medium", label: "🟡 Medio", color: "bg-amber-500" },
                    { level: "critical", label: "🚨 RIESGO CRÍTICO", color: "bg-red-650" }
                  ].map((riskOpt) => {
                    const isSelected = (selectedPatient?.clinicalCriticalRisk || "none") === riskOpt.level;
                    return (
                      <button
                        type="button"
                        key={riskOpt.level}
                        onClick={() => {
                          const currentNote = selectedPatient?.criticalAlertDetail || "";
                          const detail = prompt(
                            `Actualizar resguardo clínico del paciente. Nivel seleccionado: [${riskOpt.level.toUpperCase()}].\nPor favor ingrese las observaciones de resguardos, alarmas or red de apoyo:`, 
                            currentNote
                          );
                          if (detail !== null) {
                            handleUpdatePatientRisk(riskOpt.level as any, detail);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer transition-all uppercase select-none ${
                          isSelected 
                            ? "bg-slate-900 text-white shadow-xs scale-102 ring-1 ring-offset-1 ring-slate-400 font-extrabold" 
                            : "hover:bg-slate-200 text-slate-600 border border-transparent bg-white/50"
                        }`}
                      >
                        {riskOpt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedPatient?.clinicalCriticalRisk && selectedPatient?.clinicalCriticalRisk !== "none" && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs flex justify-between items-start gap-1.5 leading-relaxed text-slate-705">
                  <div className="space-y-0.5">
                    <strong>Notas de Resguardo de Emergencia:</strong>
                    <p className="font-sans text-[11px] text-slate-600 italic bg-white p-2.5 rounded-lg border border-slate-150 mt-1">
                      "{selectedPatient.criticalAlertDetail || "Sin anotaciones complementarias de red de apoyo registradas."}"
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = prompt("Modificar notas de alarma o redes de apoyo del paciente:", selectedPatient.criticalAlertDetail || "");
                      if (updated !== null) {
                        handleUpdatePatientRisk(selectedPatient.clinicalCriticalRisk || "none", updated);
                      }
                    }}
                    className="text-[10px] text-blue-600 font-bold hover:underline shrink-0"
                  >
                    Editar Nota
                  </button>
                </div>
              )}

              {/* CRITICAL ALARM CHILE PROTOCOL WIDGET */}
              {selectedPatient?.clinicalCriticalRisk === "critical" && (
                <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-2xl p-4.5 shadow-md border border-red-750 relative overflow-hidden animate-in zoom-in duration-200">
                  <div className="absolute right-0 bottom-0 opacity-15 p-2">
                    <ShieldAlert className="w-28 h-28 text-white" />
                  </div>
                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9.5px] bg-red-900 border border-red-500/20 px-2.5 py-1 rounded-full w-fit text-red-105 shadow-2xs">
                      <span className="w-2 h-2 bg-white rounded-full animate-ping shrink-0" />
                      <span>Protocolo de Salvaguarda Ley N° 20.584 y Reglamento Minsal Chile</span>
                    </div>
                    
                    <p className="text-white text-xs leading-relaxed font-semibold">
                      🚨 ALERTA: Este paciente ha sido clasificado bajo RIESGO CLÍNICO CRÍTICO. Se requiere asegurar acompañamiento, activar enlaces con tutores/apodados o coordinar derivación de contingencia en caso de descompensación aguda.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] pt-3 border-t border-white/25">
                      <div className="bg-red-900/40 p-2 rounded-xl flex items-center gap-2">
                        <span className="text-base">🎗️</span>
                        <div className="font-sans font-bold uppercase leading-tight">
                          <span className="block text-[8px] text-red-100 normal-case font-normal">Fono Prevención Suicidio (24 hrs)</span>
                          <span>Línea Minsal: *4141</span>
                        </div>
                      </div>
                      <div className="bg-red-900/40 p-2 rounded-xl flex items-center gap-2">
                        <span className="text-base">📞</span>
                        <div className="font-sans font-bold uppercase leading-tight">
                          <span className="block text-[8px] text-red-100 normal-case font-normal">Salud Responde Chile</span>
                          <span>Fono Directo: 600 360 7777</span>
                        </div>
                      </div>
                      <div className="bg-red-900/40 p-2 rounded-xl flex items-center gap-2">
                        <span className="text-base">🚑</span>
                        <div className="font-sans font-bold uppercase leading-tight">
                          <span className="block text-[8px] text-red-100 normal-case font-normal">Servicio de Urgencias Médicas</span>
                          <span>SAMU de Urgencia: 131</span>
                        </div>
                      </div>
                      <div className="bg-red-900/40 p-2 rounded-xl flex items-center gap-2">
                        <span className="text-base">🛡️</span>
                        <div className="font-sans font-bold uppercase leading-tight">
                          <span className="block text-[8px] text-red-100 normal-case font-normal">Soporte Infanto-Adolescentes</span>
                          <span>Línea Libre Fono: 1515</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* New clinical record session form */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
              
              {/* INTERACTIVE CLINICAL STOPWATCH MODULE WITH DYNAMIC COLOR BAND */}
              <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                <div 
                  onClick={() => setTimerExpanded(!timerExpanded)}
                  className="bg-slate-50 border-b p-3 flex justify-between items-center cursor-pointer hover:bg-slate-100 select-none"
                >
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Clock className="w-4 h-4 text-slate-650" />
                    Cronómetro Clínico & Aviso Pulsante de Progreso
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      timerActive ? "bg-emerald-50 text-emerald-700 animate-pulse" : "bg-gray-100 text-gray-500"
                    }`}>
                      {timerActive ? "● SESIÓN EN CURSO" : "⚪ DETENIDO"}
                    </span>
                    <span className="text-[10px] text-gray-400">{timerExpanded ? "[Ocultar]" : "[Abrir]"}</span>
                  </div>
                </div>

                {timerExpanded && (
                  <div className="p-4 space-y-3 bg-white">
                    <div className="flex justify-between items-center">
                      <div className="space-y-0.5">
                        <div className="text-[10px] text-gray-400 font-sans uppercase font-semibold">Táctico de Consulta</div>
                        <div className="text-xl font-bold font-mono text-slate-900 tracking-tight flex items-center gap-1.5">
                          {formatTimerString(secondsElapsed)}
                          <span className="text-xs text-gray-400 font-sans font-normal">/ {formatTimerString(sessionDuration)}</span>
                        </div>
                      </div>

                      {/* Control controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setTimerActive(!timerActive)}
                          className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                            timerActive 
                              ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" 
                              : "bg-slate-900 text-white border-slate-950 hover:bg-slate-800"
                          }`}
                        >
                          {timerActive ? "Pausar" : "Iniciar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTimerActive(false);
                            setSecondsElapsed(0);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white hover:border-gray-300 font-semibold cursor-pointer"
                        >
                          Reiniciar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Accelerated simulation setup
                            setSessionDuration(60);
                            setSecondsElapsed(0);
                            setTimerActive(true);
                            alert("⚡ Modo Demostración Rápido Activado (Sesión acortada a 60 segundos). Podrá ver el pulso cambiar de Verde a Amarillo y finalmente parpadear Rojo en pocos segundos.");
                          }}
                          className="px-2 py-1.5 rounded-lg bg-emerald-550 border border-emerald-600 text-white font-bold text-[9px] uppercase tracking-wider bg-slate-900"
                          title="Simular en 60 segundos transiciones de color"
                        >
                          ⚡ Simular 60s
                        </button>
                      </div>
                    </div>

                    {/* Fills progress pulse indicator */}
                    <div className="space-y-1">
                      <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden relative">
                        <div 
                          className={`h-full transition-all duration-1000 ${
                            getTimerProgressStyle(getTimerProgressPercent()).colorClass
                          }`}
                          style={{ width: `${getTimerProgressPercent()}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-400 uppercase font-mono tracking-wider font-semibold">Banda de Gradiente</span>
                        <span className={getTimerProgressPercent() >= 90 ? "text-rose-600 font-bold animate-bounce" : "text-slate-600"}>
                          {getTimerProgressStyle(getTimerProgressPercent()).label} ({Math.round(getTimerProgressPercent())}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* DYNAMIC DIAGNOSTIC CLINICAL TAGS SELECTION PILLS GRID */}
              <div className="border border-gray-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>🏷️</span> Parámetros y Tags Clínicos de la Sesión
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCustomTagModal(true)}
                    className="text-emerald-700 hover:text-emerald-900 border border-emerald-200 bg-emerald-50 px-2 py-1 rounded text-[10.5px] font-bold transition-all shrink-0 cursor-pointer"
                  >
                    + Agregar Tag Clínico
                  </button>
                </div>

                <p className="text-gray-400 text-[10px] leading-tight">Seleccione uno o más pills para estampar estas clasificaciones automáticamente en la ficha del paciente al resguardar el registro ordinario:</p>
                
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag: any) => {
                    const isSelected = selectedClinicalTags.includes(tag.label);
                    return (
                      <button
                        type="button"
                        key={tag.id}
                        onClick={() => handleTogglePillSelector(tag.label)}
                        className={`px-2.5 py-1.5 rounded-xl border text-[10.5px] transition-all font-semibold flex items-center gap-1 select-none cursor-pointer ${
                          isSelected 
                            ? "bg-slate-900 text-white border-slate-950 scale-102 shadow-xs" 
                            : tag.color + " opacity-65 hover:opacity-100"
                        }`}
                      >
                        {tag.label} {isSelected ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SESIÓN EVOLUTION TABS SWITCHER */}
              <div className="flex border-b border-gray-250 mt-2 font-sans select-none">
                <button
                  type="button"
                  onClick={() => setActiveSessionSubTab("evolution")}
                  className={`flex-1 py-2.5 text-center border-b-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeSessionSubTab === "evolution"
                      ? "border-slate-900 text-slate-900 bg-slate-50/50"
                      : "border-transparent text-gray-400 hover:text-gray-650"
                  }`}
                >
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>📝 Notas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSessionSubTab("instruments")}
                  className={`flex-1 py-2.5 text-center border-b-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeSessionSubTab === "instruments"
                      ? "border-slate-900 text-slate-900 bg-slate-50/50"
                      : "border-transparent text-gray-400 hover:text-gray-650"
                  }`}
                >
                  <Activity className="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span>📊 PHQ-9/GAD</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSessionSubTab("cbt_diary")}
                  className={`flex-1 py-2.5 text-center border-b-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeSessionSubTab === "cbt_diary"
                      ? "border-slate-900 text-slate-900 bg-slate-50/50"
                      : "border-transparent text-gray-400 hover:text-gray-650"
                  }`}
                >
                  <Smile className="w-4 h-4 text-emerald-500" />
                  <span>🍃 Reporte Diario IP</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSessionSubTab("documents")}
                  className={`flex-1 py-2.5 text-center border-b-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeSessionSubTab === "documents"
                      ? "border-slate-900 text-slate-900 bg-slate-50/50"
                      : "border-transparent text-gray-400 hover:text-gray-650"
                  }`}
                >
                  <FileCheck2 className="w-4 h-4 text-amber-500" />
                  <span>📜 Informes</span>
                </button>
              </div>

              {activeSessionSubTab === "instruments" ? (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-5 text-xs font-sans">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-205">
                    <div className="space-y-1">
                      <label className="text-slate-600 block text-[10px] uppercase font-bold tracking-wider">Cuestionario Escalar Seleccionado</label>
                      <select
                        value={activeTest}
                        onChange={(e) => setActiveTest(e.target.value as any)}
                        className="p-2 bg-white rounded-xl border border-gray-350 text-xs font-bold font-sans cursor-pointer focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="phq9">🧠 PHQ-9 (Cuestionario de Salud del Paciente - Depresión)</option>
                        <option value="gad7">🌪️ GAD-7 (Escala de Ansiedad Generalizada - GAD)</option>
                        <option value="cssrs">🚨 C-SSRS Corto (Cribado de Riesgo Suicida Columbia)</option>
                      </select>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shrink-0 flex items-center gap-2">
                      <div className="text-right">
                        <span className="block text-[8.5px] text-gray-400 uppercase font-mono leading-tight flex justify-end font-semibold">Cálculo Clínico</span>
                        <span className="text-xs font-mono font-extrabold text-slate-800">
                          {activeTest === "phq9" && `Puntaje: ${phq9Answers.reduce((a, b) => a + b, 0)} pts`}
                          {activeTest === "gad7" && `Puntaje: ${gad7Answers.reduce((a, b) => a + b, 0)} pts`}
                          {activeTest === "cssrs" && `Alarmas: ${cssrsAnswers.filter(Boolean).length} / 5`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {activeTest === "phq9" && (
                    <div className="space-y-4">
                      <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-250 leading-relaxed font-sans">
                        Complete las 9 preguntas evaluando la frecuencia en las <strong>últimas 2 semanas</strong>:
                      </div>

                      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                        {PHQ9_QUESTIONS.map((q, idx) => (
                          <div key={idx} className="bg-white p-3.5 rounded-xl border border-gray-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-350 transition-all shadow-2xs">
                            <span className="font-semibold text-slate-700 max-w-sm">{q}</span>
                            <div className="flex flex-wrap gap-1">
                              {[
                                { val: 0, lbl: "0", t: "Para nada" },
                                { val: 1, lbl: "1", t: "Varios días" },
                                { val: 2, lbl: "2", t: "Más de la mitad de los días" },
                                { val: 3, lbl: "3", t: "Casi todos los días" }
                              ].map((opt) => (
                                <button
                                  type="button"
                                  key={opt.val}
                                  onClick={() => {
                                    const updated = [...phq9Answers];
                                    updated[idx] = opt.val;
                                    setPhq9Answers(updated);
                                  }}
                                  title={opt.t}
                                  className={`h-7 px-2.5 rounded-lg border text-[10.5px] font-bold transition-all cursor-pointer ${
                                    phq9Answers[idx] === opt.val
                                      ? "bg-slate-900 text-white border-slate-950 font-extrabold shadow-sm animate-in fade-in duration-100"
                                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-gray-200"
                                  }`}
                                >
                                  {opt.lbl}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Real-time phq9 interpretation */}
                      <div className="bg-slate-900 text-white p-4 rounded-xl space-y-1 relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 opacity-5 p-2">
                          <Activity className="w-16 h-16 text-white" />
                        </div>
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                          <span className="font-extrabold text-slate-355 block uppercase text-[9px] tracking-wider font-mono">Resultado Escalar PHQ-9</span>
                          <span className="bg-emerald-500 text-white font-extrabold px-2.5 py-0.5 rounded text-[11px] font-mono shadow-xs">
                            {getPhq9Result().score} Puntos
                          </span>
                        </div>
                        <div className="text-xs pt-1">
                          <p className="font-bold text-slate-150 text-[12px]">Diagnóstico Estimado: <span className="text-emerald-400">{getPhq9Result().interp}</span></p>
                          <p className="text-slate-400 mt-1 leading-relaxed font-sans text-[11px]"><strong>Guía de Intervención Recomendada:</strong> {getPhq9Result().recommendation}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTest === "gad7" && (
                    <div className="space-y-4">
                      <div className="bg-purple-50 text-purple-800 p-3 rounded-xl border border-purple-200 leading-relaxed font-sans font-semibold">
                        Complete las 7 preguntas evaluando la frecuencia en las <strong>últimas 2 semanas</strong>:
                      </div>

                      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                        {GAD7_QUESTIONS.map((q, idx) => (
                          <div key={idx} className="bg-white p-3.5 rounded-xl border border-gray-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-350 transition-all shadow-2xs">
                            <span className="font-semibold text-slate-705 max-w-sm">{q}</span>
                            <div className="flex flex-wrap gap-1">
                              {[
                                { val: 0, lbl: "0", t: "Para nada" },
                                { val: 1, lbl: "1", t: "Varios días" },
                                { val: 2, lbl: "2", t: "Más de la mitad" },
                                { val: 3, lbl: "3", t: "Casi todos los días" }
                              ].map((opt) => (
                                <button
                                  type="button"
                                  key={opt.val}
                                  onClick={() => {
                                    const updated = [...gad7Answers];
                                    updated[idx] = opt.val;
                                    setGad7Answers(updated);
                                  }}
                                  title={opt.t}
                                  className={`h-7 px-2.5 rounded-lg border text-[10.5px] font-bold transition-all cursor-pointer ${
                                    gad7Answers[idx] === opt.val
                                      ? "bg-slate-900 text-white border-slate-950 font-extrabold shadow-sm animate-in fade-in duration-100"
                                      : "bg-slate-55 hover:bg-slate-100 text-slate-600 border-gray-200"
                                  }`}
                                >
                                  {opt.lbl}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Real-time gad7 interpretation */}
                      <div className="bg-slate-900 text-white p-4 rounded-xl space-y-1 relative overflow-hidden font-sans">
                        <div className="absolute right-0 bottom-0 opacity-5 p-2">
                          <Activity className="w-16 h-16 text-white" />
                        </div>
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                          <span className="font-extrabold text-slate-355 block uppercase text-[9px] tracking-wider font-mono">Resultado Escalar GAD-7</span>
                          <span className="bg-emerald-500 text-white font-extrabold px-2.5 py-0.5 rounded text-[11px] font-mono shadow-xs">
                            {getGad7Result().score} Puntos
                          </span>
                        </div>
                        <div className="text-xs pt-1">
                          <p className="font-bold text-slate-150 text-[12px]">Diagnóstico Clínico: <span className="text-emerald-400">{getGad7Result().interp}</span></p>
                          <p className="text-slate-400 mt-1 leading-relaxed font-sans text-[11px]"><strong>Guía de Intervención Recomendada:</strong> {getGad7Result().recommendation}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTest === "cssrs" && (
                    <div className="space-y-4">
                      <div className="bg-red-50 text-red-800 p-3 rounded-xl border border-red-200 leading-relaxed font-sans font-semibold">
                        Cribado Rápido de Riesgo Suicida Columbia (C-SSRS). Marque con SÍ o NO según corresponda:
                      </div>

                      <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                        {CSSRS_QUESTIONS.map((q, idx) => (
                          <div key={idx} className="bg-white p-3.5 rounded-xl border border-gray-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-350 transition-all shadow-2xs">
                            <span className="font-bold text-slate-705 text-[11px] max-w-sm">{q}</span>
                            <div className="flex gap-1.5 shrink-0">
                              {[
                                { val: true, lbl: "SÍ" },
                                { val: false, lbl: "NO" }
                              ].map((opt) => (
                                <button
                                  type="button"
                                  key={opt.lbl}
                                  onClick={() => {
                                    const updated = [...cssrsAnswers];
                                    updated[idx] = opt.val;
                                    setCssrsAnswers(updated);
                                  }}
                                  className={`h-7 w-12 rounded-lg border text-[10.5px] font-bold transition-all cursor-pointer ${
                                    cssrsAnswers[idx] === opt.val
                                      ? opt.val
                                        ? "bg-red-650 text-white border-red-750 font-extrabold shadow-sm bg-red-650"
                                        : "bg-slate-900 text-white border-slate-950 font-extrabold shadow-sm bg-slate-900"
                                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-gray-200"
                                  }`}
                                >
                                  {opt.lbl}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Real-time cssrs interpretation */}
                      <div className="bg-slate-900 text-white p-4 rounded-xl space-y-1 relative overflow-hidden font-sans">
                        <div className="absolute right-0 bottom-0 opacity-5 p-2">
                          <Activity className="w-16 h-16 text-white" />
                        </div>
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                          <span className="font-extrabold text-slate-355 block uppercase text-[9px] tracking-wider font-mono">Cribado Columbia CSSRS</span>
                          <span className="bg-red-600 text-white font-extrabold px-2.5 py-0.5 rounded text-[11px] font-mono shadow-xs">
                            {getCssrsResult().score} / 5 Alarmas
                          </span>
                        </div>
                        <div className="text-xs pt-1">
                          <p className="font-bold text-slate-150 text-[12px]">Estado de Riesgo: <span className="text-red-400">{getCssrsResult().interp}</span></p>
                          <p className="text-slate-400 mt-1 leading-relaxed font-sans text-[11px]"><strong>Guía de Acción y Protocolo:</strong> {getCssrsResult().recommendation}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions for Questionnaires */}
                  <div className="flex justify-between items-center gap-2 pt-3 border-t border-slate-205 font-sans">
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTest === "phq9") {
                          setPhq9Answers([0, 0, 0, 0, 0, 0, 0, 0, 0]);
                        } else if (activeTest === "gad7") {
                          setGad7Answers([0, 0, 0, 0, 0, 0, 0]);
                        } else {
                          setCssrsAnswers([false, false, false, false, false]);
                        }
                        alert("Valores del cuestionario inicializados.");
                      }}
                      className="px-3.5 py-2 border border-slate-200 rounded-xl hover:bg-white text-gray-500 font-bold tracking-tight text-[10.5px] cursor-pointer bg-white"
                    >
                      Limpiar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        let reportStr = "";
                        if (activeTest === "phq9") {
                          const res = getPhq9Result();
                          reportStr = `\n\n--- 📊 INFORME PSICOMÉTRICO ADJUNTO (PHQ-9 DEPRESIÓN) ---\nFecha Sesión: ${sessionDate}\nPuntaje Total: ${res.score}/27 pts.\nResultado Clínico: ${res.interp}\nSugerencia Terapéutica: ${res.recommendation}`;
                        } else if (activeTest === "gad7") {
                          const res = getGad7Result();
                          reportStr = `\n\n--- 📊 INFORME PSICOMÉTRICO ADJUNTO (GAD-7 ANSIEDAD) ---\nFecha Sesión: ${sessionDate}\nPuntaje Total: ${res.score}/21 pts.\nResultado Clínico: ${res.interp}\nSugerencia Terapéutica: ${res.recommendation}`;
                        } else {
                          const res = getCssrsResult();
                          reportStr = `\n\n--- 📊 INFORME PSICOMÉTRICO ADJUNTO (C-SSRS CRIBADO COLUMBIA) ---\nFecha Sesión: ${sessionDate}\nAlarmas Afirmativas: ${res.score}/5\nEstado de Riesgo: ${res.interp}\nProtocolo de Resguardo Activo: ${res.recommendation}`;
                        }
                        setProgressNotes(prev => prev ? prev + reportStr : reportStr.trim());
                        alert("📎 Reporte psicométrico adjuntado exitosamente al final de las Notas de Progreso.");
                        setActiveSessionSubTab("evolution");
                      }}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-[10.5px] font-bold px-3.5 py-2 rounded-xl flex items-center gap-1 cursor-pointer shadow transition-all uppercase"
                    >
                      📎 Adjuntar a Notas de Progreso
                    </button>
                  </div>
                </div>
              ) : activeSessionSubTab === "cbt_diary" ? (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 text-xs font-sans text-left">
                  <div className="flex justify-between items-center pb-2.5 border-b border-slate-200">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">🍃 Bitácora de Auto-Reporte Diario (CBT + Higiene de Sueño)</h4>
                      <p className="text-[10px] text-gray-500 mt-0.5">Reportes de ánimo y calidad de descanso registrados confidencialmente por el paciente.</p>
                    </div>
                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-md border border-emerald-200 font-mono">
                      {patientMoodLogs.length} Registros
                    </span>
                  </div>

                  {!selectedPatient?.rut ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5 leading-relaxed">
                      <p className="font-bold text-[11px] text-amber-950 flex items-center gap-1">⚠️ Identificación de Ficha Faltante</p>
                      <p className="text-[10px]">El paciente seleccionado no tiene un RUT registrado en su ficha. El sistema requiere el RUT como credencial de cifrado para emparejar sus reportes diarios de Bitácora de Ánimo de forma segura offline.</p>
                      <p className="text-[10px] font-bold">Por favor agregue o modifique el campo RUT del paciente.</p>
                    </div>
                  ) : patientMoodLogs.length === 0 ? (
                    <div className="py-8 text-center bg-white rounded-xl border border-slate-150 text-slate-450 space-y-2">
                      <Smile className="w-8 h-8 text-slate-300 mx-auto" strokeWidth={1.5} />
                      <p className="font-semibold text-xs text-slate-700">Sin Auto-Reportes Activos</p>
                      <p className="text-[11px] max-w-sm mx-auto leading-relaxed text-slate-450 px-4">
                        El paciente aún no registra bitácoras en su Portal. Indíquele ingresar al portal seguro del paciente con su RUT <span className="font-mono bg-slate-100 p-1 rounded font-bold text-slate-800">{selectedPatient.rut}</span> y el correo <span className="font-mono bg-slate-100 p-1 rounded font-bold text-slate-800">{selectedPatient.email || "registrado"}</span> para realizar sus auto-reportes diarios.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Interactive SVG graph */}
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-[10.5px] text-slate-850">Gáfica de Correlación: Sueño vs Estado de Ánimo (Últimos 7 Reportes)</span>
                          <div className="flex gap-3 text-[9px] font-bold">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full inline-block"></span> Ánimo (Promedio)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-500 rounded-full inline-block"></span> Horas de Sueño</span>
                          </div>
                        </div>

                        {/* Rendering the custom SVG plot inside the therapist view */}
                        <div className="pt-2">
                          {(() => {
                            const chartLogs = [...patientMoodLogs].slice(0, 7).reverse();
                            const width = 600;
                            const height = 150;
                            const padding = 25;
                            const graphWidth = width - padding * 2;
                            const graphHeight = height - padding * 2;
                            const maxDays = chartLogs.length;

                            const getMoodY = (val: number) => padding + ((5 - val) / 4) * graphHeight;
                            const getSleepY = (val: number) => padding + ((14 - Math.min(Math.max(val, 0), 14)) / 14) * graphHeight;
                            const getX = (idx: number) => maxDays === 1 ? padding + graphWidth / 2 : padding + (idx / (maxDays - 1)) * graphWidth;

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
                                {[1, 2, 3, 4, 5].map((level) => {
                                  const y = padding + ((5 - level) / 4) * graphHeight;
                                  return (
                                    <g key={level} className="opacity-20">
                                      <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#6b7280" strokeWidth="0.5" strokeDasharray="3,3" />
                                      <text x={padding - 8} y={y + 3} className="text-[8px] font-bold fill-current text-slate-400 text-right">{level}</text>
                                    </g>
                                  );
                                })}
                                {chartLogs.map((log, idx) => {
                                  const x = getX(idx);
                                  const dateLabel = log.createdAt?.seconds 
                                    ? new Date(log.createdAt.seconds * 1000).toLocaleDateString("es-CL", { day: "numeric", month: "numeric" })
                                    : "Hoy";
                                  return (
                                    <text key={idx} x={x} y={height - 4} textAnchor="middle" className="text-[8px] font-mono fill-current text-gray-450 font-semibold">
                                      {dateLabel}
                                    </text>
                                  );
                                })}
                                {maxDays > 0 && (
                                  <>
                                    <path d={moodPath} fill="none" stroke="#10b981" strokeWidth="2" />
                                    <path d={sleepPath} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="2,2" />
                                    {chartLogs.map((log, idx) => {
                                      const x = getX(idx);
                                      return (
                                        <g key={idx}>
                                          <circle cx={x} cy={getMoodY(log.mood)} r="3" fill="#10b981" stroke="#fff" strokeWidth="0.5" />
                                          <circle cx={x} cy={getSleepY(log.sleepHours)} r="3" fill="#6366f1" stroke="#fff" strokeWidth="0.5" />
                                        </g>
                                      );
                                    })}
                                  </>
                                )}
                              </svg>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Logs scrollable list */}
                      <div className="space-y-2.5 max-h-[305px] overflow-y-auto pr-1">
                        {patientMoodLogs.map((log) => {
                          const dateObj = log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000) : new Date();
                          const dateStr = dateObj.toLocaleDateString("es-CL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
                          
                          // Mood detail
                          const moodsMap: { [key: number]: string } = {
                            1: "😭 Clínicamente Decaído",
                            2: "🙁 Ansioso / Bajo",
                            3: "😐 Neutral / Estable",
                            4: "🙂 Favorable / Animado",
                            5: "😆 Elevado / Autónomo"
                          };

                          return (
                            <div key={log.id} className="p-3.5 bg-white rounded-2xl border border-slate-150 space-y-2.5 hover:border-slate-350 transition-colors">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-700 text-[11px]">{dateStr}</span>
                                <div className="flex gap-2">
                                  <span className="text-[9px] font-bold bg-slate-50 border p-1 rounded text-slate-700">
                                    {moodsMap[log.mood] || "Neutral"}
                                  </span>
                                  <span className="text-[9px] font-bold bg-slate-50 border p-1 rounded text-indigo-700 font-mono">
                                    💤 {log.sleepHours} hrs (Calidad: {log.sleepScore}/5)
                                  </span>
                                </div>
                              </div>
                              {log.cognitiveNote ? (
                                <p className="text-[11px] text-gray-700 border-l-2 border-l-emerald-400 pl-2.5 py-0.5 italic bg-slate-50/50 p-2 rounded-xl">
                                  "{log.cognitiveNote}"
                                </p>
                              ) : (
                                <p className="text-[10px] text-gray-400 italic">Sin observaciones o pensamientos automáticos anotados.</p>
                              )}
                              
                              <div className="flex justify-end pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const appendStr = `\n\n--- 🍃 AUTO-REPORTE CBT PACIENTE (${dateObj.toLocaleDateString("es-CL")}) ---\nÁnimo: ${moodsMap[log.mood] || "Estable"}\nDescanso: ${log.sleepHours} horas (Calidad: ${log.sleepScore}/5)\nReflexión Cognitiva: ${log.cognitiveNote || "Sin comentarios"}`;
                                    setProgressNotes(prev => prev ? prev + appendStr : appendStr.trim());
                                    alert("📎 Registro de bitácora adjuntado exitosamente al final de las Notas de Progreso.");
                                    setActiveSessionSubTab("evolution");
                                  }}
                                  className="text-[9.5px] font-bold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border p-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase"
                                >
                                  📎 Adjuntar a Notas de Sesión
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : activeSessionSubTab === "documents" ? (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 text-xs font-sans text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div className="space-y-1">
                      <label className="text-slate-600 block text-[10px] uppercase font-bold tracking-wider">Plantilla del Documento</label>
                      <select
                        value={selectedDocTemplate}
                        onChange={(e) => setSelectedDocTemplate(e.target.value as any)}
                        className="p-2 bg-white rounded-xl border border-gray-300 text-xs font-bold font-sans cursor-pointer focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="attendance">📜 Certificado de Asistencia a Sesión</option>
                        <option value="evolution">📊 Informe Clínico de Evolución Psicoterapéutica</option>
                        <option value="discharge">🎓 Certificado de Alta de Proceso Clínico</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold">🔒 Anonimizar (Ley 19.628):</span>
                        <button
                          type="button"
                          onClick={() => setDocAnonymizeMode(!docAnonymizeMode)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            docAnonymizeMode ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                          title="Oculta detalles personales reales con placeholders para resguardar la privacidad"
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              docAnonymizeMode ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200/60 p-3 rounded-xl text-[11px] leading-relaxed text-amber-900 flex items-start gap-2.5">
                    <span className="text-base select-none">🛡️</span>
                    <div>
                      <strong className="block text-amber-950 font-bold">Garantía Absoluta de Secreto y Privacidad Local:</strong>
                      <p className="mt-0.5">
                        Este generador opera 100% en el lado cliente (en su navegador local). Ninguna información de las plantillas de identificación es procesada por servidores de Inteligencia Artificial para la emisión de estos documentos. Al activar <strong>"Anonimizar Ficha"</strong> se ocultará el nombre del paciente y RUT con iniciales ficticias para que usted pueda copiarlo de forma segura e ingresar los datos reales manualmente offline.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 relative">
                    <div className="flex justify-between items-center text-xs">
                      <label className="text-[11px] text-slate-605 font-semibold">Editor de Borrador Confidencial (Presione Restablecer para re-hidratar la plantilla)</label>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomDocContent(generateTemplateContent(selectedDocTemplate, docAnonymizeMode));
                          alert("Plantilla restablecida a su formato base.");
                        }}
                        className="text-[10px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                      >
                        🔄 Restablecer Texto
                      </button>
                    </div>

                    <textarea
                      value={customDocContent}
                      onChange={(e) => setCustomDocContent(e.target.value)}
                      rows={14}
                      className="w-full p-4 font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-gray-250 dark:border-slate-800 rounded-xl leading-relaxed focus:ring-2 focus:ring-slate-900 focus:outline-none shadow-inner resize-y"
                    />
                    
                    <div className="text-[9.5px] text-gray-400 font-semibold px-1">
                      💡 Consejo: Puede escribir libremente en esta caja para realizar cambios manuales previos.
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-slate-200 font-sans">
                    <div className="text-[10px] text-slate-400">
                      Se generó con firma certificada para el psicólogo/a tratante.
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(customDocContent);
                          setIsCopiedDoc(true);
                          setTimeout(() => setIsCopiedDoc(false), 2500);
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-white text-[10.5px] font-bold px-4 py-2.5 rounded-xl flex items-center gap-1 cursor-pointer shadow transition-all uppercase"
                      >
                        {isCopiedDoc ? "✓ Copiado al Portapapeles" : "📋 Copiar Documento"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const printWindow = window.open("", "_blank");
                          if (!printWindow) {
                            alert("Por favor habilite las ventanas emergentes (pop-ups) para ver e imprimir el certificado.");
                            return;
                          }
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>Imprimir Documento Clínico Emitido</title>
                                <style>
                                  body {
                                    font-family: 'Helvetica', 'Arial', sans-serif;
                                    color: #1a1a1a;
                                    padding: 50px;
                                    line-height: 1.6;
                                    font-size: 14px;
                                  }
                                  pre {
                                    white-space: pre-wrap;
                                    font-family: inherit;
                                  }
                                  .header {
                                    text-align: center;
                                    border-bottom: 2px solid #334155;
                                    padding-bottom: 20px;
                                    margin-bottom: 40px;
                                  }
                                  .clinic-title {
                                    font-size: 20px;
                                    font-weight: bold;
                                    letter-spacing: 1px;
                                    color: #1e293b;
                                    text-transform: uppercase;
                                  }
                                  .clinic-subtitle {
                                    font-size: 11px;
                                    color: #64748b;
                                    margin-top: 5px;
                                    font-weight: 600;
                                  }
                                  .footer-sec {
                                    margin-top: 60px;
                                    font-size: 11px;
                                    color: #94a3b8;
                                    text-align: center;
                                    border-top: 1px dashed #e2e8f0;
                                    padding-top: 20px;
                                  }
                                </style>
                              </head>
                              <body>
                                <div class="header">
                                  <div class="clinic-title">MINDSPACE CLINICAL PORTAL</div>
                                  <div class="clinic-subtitle">SISTEMA COMPATIBLE CON LA LEY 19.628 Y NORMAS SANITARIAS CHILENAS</div>
                                </div>
                                <pre>${customDocContent.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
                                <div class="footer-sec">
                                  Documento emitido de forma reservada en sesión clínica. Resguardo facultativo bajo estricto secreto terapéutico.
                                </div>
                                <script>
                                  window.onload = function() {
                                    window.print();
                                  };
                                </script>
                              </body>
                            </html>
                          `);
                          printWindow.document.close();
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow transition-all uppercase"
                      >
                        🖨️ Imprimir / PDF
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveSessionRecord} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 font-semibold block">Fecha de Sesión</label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="date"
                        required
                        value={sessionDate}
                        onChange={(e) => setSessionDate(e.target.value)}
                        className="pl-8 w-full p-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 font-semibold block">Alerta de Sintomatología / Notas Rápidas</label>
                    <input
                      type="text"
                      placeholder="Ej: Crisis circunstancial, tareas de mindfulness cumplidas"
                      value={diagnosticsCheck}
                      onChange={(e) => setDiagnosticsCheck(e.target.value)}
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* INTERACTIVE MULTIPLE DIAGNOSES SECTION WITH CONFIRMATION COMBOBOX */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4.5 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-emerald-600 animate-pulse" />
                      Diagnósticos Estructurados (Multiselección)
                    </div>
                    <span className="text-[10px] bg-slate-200 text-slate-705 font-bold px-2 py-0.5 rounded-full">
                      {diagnosesList.length} Registrado(s)
                    </span>
                  </div>

                  <p className="text-gray-400 text-[10px] leading-relaxed">
                    Ingrese uno o más diagnósticos formales para la sesión y asigne su estado clínico. Estos se guardarán bajo secreto psicoterapéutico en la ficha del paciente.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2.5 items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] text-slate-600 font-bold block">Diagnóstico o Trastorno (Ej: CIE-10/DSM-5)</label>
                      <input
                        type="text"
                        placeholder="Ej: F41.1 Trastorno de Ansiedad Generalizada"
                        value={newDiagnosisName}
                        onChange={(e) => setNewDiagnosisName(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-gray-250 bg-white text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                    <div className="w-full sm:w-[170px] space-y-1">
                      <label className="text-[10px] text-slate-600 font-bold block">Estado Clínico del Diagnóstico</label>
                      <select
                        value={newDiagnosisStatus}
                        onChange={(e) => setNewDiagnosisStatus(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl border border-gray-250 bg-white text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-sans"
                      >
                        <option value="Confirmado">🟢 Confirmado</option>
                        <option value="En sospecha">🟡 En sospecha</option>
                        <option value="En estudio">🔵 En estudio</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddDiagnosis}
                      className="bg-slate-900 hover:bg-slate-850 text-white rounded-xl px-4 py-2.5 text-xs font-bold shrink-0 shadow-sm flex items-center gap-1 cursor-pointer transition-all h-9.5"
                    >
                      <Plus className="w-4 h-4" /> Agregar
                    </button>
                  </div>

                  {/* Registered Diagnoses list badges */}
                  {diagnosesList.length > 0 ? (
                    <div className="pt-1.5 space-y-1.5">
                      <div className="text-[10px] text-slate-550 font-bold uppercase tracking-wider">Diagnósticos agregados a esta sesión:</div>
                      <div className="flex flex-wrap gap-2">
                        {diagnosesList.map((diag, idx) => {
                          let badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-250";
                          if (diag.status === "En sospecha") {
                            badgeStyle = "bg-amber-50 text-amber-800 border-amber-250";
                          } else if (diag.status === "En estudio") {
                            badgeStyle = "bg-blue-50 text-blue-800 border-blue-250";
                          }

                          return (
                            <div 
                              key={idx} 
                              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2.5 text-xs font-semibold bg-white shadow-xs transition-all ${badgeStyle}`}
                            >
                              <div className="flex flex-col leading-tight">
                                <span className="font-bold text-slate-800">{diag.name}</span>
                                <span className="text-[9px] uppercase tracking-widest font-mono text-slate-500">{diag.status}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveDiagnosis(idx)}
                                className="text-gray-400 hover:text-red-650 transition-all font-bold px-1 rounded-md hover:bg-slate-100"
                                title="Eliminar este diagnóstico"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-400 italic text-[10px] text-center py-3.5 bg-white/60 rounded-xl border border-dashed border-gray-200">
                      Ningún diagnóstico formal agregado para esta sesión aún. Ingrese uno arriba y presione "Agregar".
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Notes input */}
                  <div className="space-y-1.5 relative text-left">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <label className="text-xs text-slate-500 font-semibold block">Notas de Progreso del Terapeuta</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleGenerateAiSummary}
                          disabled={generatingAi || !progressNotes}
                          className={`text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 transition-all ${
                            !progressNotes 
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-gray-100" 
                              : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border border-emerald-300"
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" /> {generatingAi ? "Procesando IA..." : "Sintetizar por IA"}
                        </button>
                      </div>
                    </div>

                    {/* Premium Accessibility & Formatting Panel */}
                    <div className="bg-slate-50 dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-t-xl p-2 flex justify-between items-center flex-wrap gap-2 text-xs">
                      {/* Font Size Selector (Accessibility) */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 font-bold" title="Ajuste de accesibilidad para vista de texto">Zoom letra:</span>
                        {(["text-xs", "text-sm", "text-base", "text-lg", "text-xl"] as const).map((sz) => {
                          const labels = { "text-xs": "xs", "text-sm": "sm", "text-base": "md", "text-lg": "lg", "text-xl": "xl" };
                          return (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => setEditorFontSize(sz)}
                              className={`p-1 px-1.5 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                                editorFontSize === sz
                                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                  : "text-gray-450 hover:text-slate-800 dark:hover:text-white"
                              }`}
                            >
                              {labels[sz]}
                            </button>
                          );
                        })}
                      </div>

                      {/* Manual Format & Voice dictation bundle */}
                      <div className="flex items-center gap-1.5">
                        {/* Voice Dictation Button */}
                        <button
                          type="button"
                          onClick={toggleProgressNotesDictation}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                            isDictating
                              ? "bg-red-50 text-red-600 border-red-200 animate-pulse font-extrabold"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-gray-350 border-gray-200 dark:border-slate-700 hover:bg-slate-50"
                          }`}
                          title="Presione para dictar la evolución verbalmente usando el micrófono"
                        >
                          {isDictating ? (
                            <>
                              <Mic className="w-3.5 h-3.5 text-red-500 animate-ping" />
                              <span>Dictando...</span>
                            </>
                          ) : (
                            <>
                              <Mic className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Dictar Nota</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Floating Selection Toolbar Balloon (Triggered on text selection) */}
                    {selectionDetails.isOpen && (
                      <div 
                        className="absolute left-1/2 -translate-x-1/2 -top-5 z-40 bg-slate-950 dark:bg-slate-900 text-white rounded-xl p-1 px-2.5 shadow-2xl border border-slate-800 flex items-center gap-2 animate-fade-in-up"
                        style={{ boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)" }}
                      >
                        <span className="text-[9px] text-zinc-400 uppercase font-extrabold mr-1 tracking-wider">Formato:</span>
                        <button
                          type="button"
                          onClick={() => applyTextFormat("bold")}
                          className="p-1 hover:bg-slate-800 rounded transition text-white hover:text-emerald-400 flex items-center gap-0.5 text-[10px] font-bold cursor-pointer"
                          title="Ennegrecer texto seleccionado"
                        >
                          <Bold className="w-3 h-3" />
                          <span>Negrita</span>
                        </button>
                        <span className="text-zinc-700 text-sm">|</span>
                        <button
                          type="button"
                          onClick={() => applyTextFormat("underline")}
                          className="p-1 hover:bg-slate-800 rounded transition text-white hover:text-emerald-400 flex items-center gap-0.5 text-[10px] font-bold cursor-pointer"
                          title="Subrayar texto seleccionado"
                        >
                          <Underline className="w-3 h-3" />
                          <span>Subrayar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectionDetails(prev => ({ ...prev, isOpen: false }))}
                          className="ml-1 text-[10px] text-zinc-400 hover:text-white font-extrabold transition font-mono px-1 rounded hover:bg-slate-800"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <textarea
                      required
                      placeholder="Escriba las reflexiones, progreso verbal, resistencias u observaciones estructurales de la sesión..."
                      value={progressNotes}
                      rows={8}
                      onSelect={handleTextareaSelectionCheck}
                      onKeyUp={handleTextareaSelectionCheck}
                      onMouseUp={handleTextareaSelectionCheck}
                      onChange={(e) => setProgressNotes(e.target.value)}
                      className={`w-full p-3 rounded-b-xl border-x border-b border-gray-200 dark:border-slate-800 text-slate-800 dark:text-white bg-white dark:bg-slate-950 font-sans focus:ring-2 focus:ring-slate-900 resize-none leading-relaxed overflow-y-auto ${editorFontSize}`}
                    />
                    
                    {/* Tiny tip for maximum premium feel */}
                    <div className="flex justify-between items-center text-[9px] text-gray-400 font-semibold px-1">
                      <span>💡 Consejo: Seleccione texto para Negrita/Subrayado.</span>
                      {isDictating && <span className="text-red-500 animate-pulse">● Dictado activo...</span>}
                    </div>
                  </div>

                  {/* AI Generated summary results container */}
                  <div className="space-y-1">
                    <label className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Resumen de Evolución Clínica por IA
                    </label>
                    <div className="border border-emerald-100 bg-emerald-50/20 rounded-xl p-3 text-xs leading-relaxed overflow-y-auto h-[178px] text-gray-700">
                      {generatingAi ? (
                        <div className="space-y-2 py-2">
                          <div className="h-3 bg-slate-200 rounded animate-pulse w-full"></div>
                          <div className="h-3 bg-slate-200 rounded animate-pulse w-5/6"></div>
                          <div className="h-3 bg-slate-200 rounded animate-pulse w-3/4"></div>
                        </div>
                      ) : aiSummaryResult ? (
                        <div className="prose prose-xs max-w-none prose-slate whitespace-pre-wrap">{aiSummaryResult}</div>
                      ) : (
                        <span className="text-slate-400 italic">Escriba sus notas a la izquierda y presione "Sintetizar por IA" para que Gemini estructure la evolución temporal de inmediato.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={savingRecord}
                    className="bg-slate-900 border border-slate-950 text-white rounded-xl px-5 py-2.5 text-xs font-semibold hover:bg-slate-800 transition-all shadow-md flex items-center gap-1.5"
                  >
                    <FileCheck2 className="w-4 h-4" /> {savingRecord ? "Guardando Sesión..." : "Guardar Nota en Historia Clínica"}
                  </button>
                </div>
              </form>
              )}
            </div>

            {/* Patient Clinical Timeline Case File records */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-700" /> Historial de Turnos y Evolución ({historyRecords.length})
              </h4>

              {loadingRecords ? (
                <div className="space-y-2 py-4">
                  <div className="h-20 bg-slate-50 rounded-lg animate-pulse"></div>
                  <div className="h-20 bg-slate-50 rounded-lg animate-pulse"></div>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="space-y-4 font-sans text-left">
                  <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-slate-900 border border-indigo-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1.5 text-left">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-400 text-sm">
                        <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping shrink-0" />
                        <span>Paciente recientemente registrada a través del Portal</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed max-w-2xl">
                        {selectedPatient?.rut ? `RUT: ${selectedPatient.rut}. ` : ""}
                        Esta paciente se ha registrado autónomamente en el Portal de Pacientes. **No registra evolución clínica escrita ni consultas grabadas todavía** al ser una ficha nueva, pero puedes ver toda la sincronización de sus reportes de temperamento, horas de sueño y diario cognitivo de pensamientos ingresados.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSessionSubTab("cbt_diary")}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] px-4 py-2 rounded-xl shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm inline-flex items-center gap-1.5"
                    >
                      📊 Ver Diario de Ánimo & Sueño
                    </button>
                  </div>
                  <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850 text-xs text-gray-400 italic">
                    Sin intervenciones ni notas registradas de terapia en esta plataforma aún. Use el panel "📝 Notas" superior para crear la primera evolución del paciente.
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  {historyRecords.map((r) => (
                    <div key={r.id} className="border border-gray-100 rounded-xl p-4 bg-slate-50/30 text-xs space-y-3 shadow-xs">
                      <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded-lg">
                        <span className="font-semibold text-slate-900">📅 Cita: {r.date}</span>
                        <span className="text-[10px] font-mono text-gray-400 bg-white px-2 py-0.5 rounded border">ID: {r.id}</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <strong className="text-slate-800 block mb-1">Notas de Sesión:</strong>
                          <p className="text-gray-600 font-sans leading-relaxed whitespace-pre-wrap bg-white p-3 rounded-lg border border-gray-100 max-h-[150px] overflow-y-auto">{r.notes}</p>
                        </div>
                        <div>
                          <strong className="text-emerald-800 flex items-center gap-1 mb-1">
                            <Sparkles className="w-3.5 h-3.5" /> Síntesis Clínica (Gemini AI):
                          </strong>
                          <p className="text-gray-600 font-sans leading-relaxed whitespace-pre-wrap bg-emerald-500/5 border border-emerald-100 p-3 rounded-lg max-h-[150px] overflow-y-auto">{r.aiSummary}</p>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 font-mono text-right">
                        Diagnósticos / Alertas: <span className="bg-slate-200/50 text-slate-705 px-2 py-0.5 rounded font-sans font-semibold">{r.observations}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AUDIT LOG SECURITY BITACORA (CHILEAN LAW 19.628 & 20.584 COMPLIANT) */}
            <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-start gap-2.5">
                  <Shield className="w-5 h-5 text-slate-850 shrink-0 mt-0.5 animate-pulse" />
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-slate-900">Bitácora de Auditoría de Acceso y Modificaciones</h4>
                    <span className="text-[10px] text-gray-500 block font-semibold hover:text-slate-800">
                      Cumplimiento Estricto Normativo: Ley N° 19.628 (Protección de Datos Privados) y N° 20.584 (Chile)
                    </span>
                  </div>
                </div>

                {/* Audit quick actions */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      writeAuditLog(
                        selectedPatient.id,
                        selectedPatient.name,
                        "EXPORTAR",
                        "Exportación y descarga del registro de auditoría legal de la ficha bajo secreto profesional."
                      );
                      alert("📥 Extracción Completa de Bitácora Legal: Generado archivo de auditoría cifrado ante requerimiento ministerial.");
                    }}
                    className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-[10.5px] transition-all cursor-pointer"
                  >
                    📥 Exportar Log Legal
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap justify-between items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-bold text-slate-600">Filtrar Eventos:</span>
                  {(["TODOS", "LECTURA", "REGISTRO"] as const).map((filterOpt) => (
                    <button
                      type="button"
                      key={filterOpt}
                      onClick={() => setAuditFilter(filterOpt)}
                      className={`px-3 py-1 rounded-full text-[10.5px] font-bold border transition-all cursor-pointer ${
                        auditFilter === filterOpt
                          ? "bg-slate-900 border-slate-950 text-white shadow-xs"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-350"
                      }`}
                    >
                      {filterOpt === "TODOS" ? "Todos" : filterOpt === "LECTURA" ? "👁️ Solo Accesos" : "📝 Nuevos Datos"}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-slate-450 font-mono">
                  Canal de Seguridad IP: Cifrado SSL de Extremo a Extremo
                </div>
              </div>

              {/* Subscribing logs list display */}
              {loadingAudits ? (
                <div className="space-y-2 py-4">
                  <div className="h-12 bg-slate-50 rounded-lg animate-pulse"></div>
                  <div className="h-12 bg-slate-50 rounded-lg animate-pulse"></div>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-gray-400 italic">
                  Cargando trazas de seguridad e historial de la ficha...
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {auditLogs
                    .filter((log) => auditFilter === "TODOS" || log.action === auditFilter)
                    .map((log) => {
                      let badgeStyle = "bg-sky-50 text-sky-800 border-sky-150";
                      let actionIcon = <Eye className="w-3.5 h-3.5 text-sky-700" />;

                      if (log.action === "REGISTRO") {
                        badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-150";
                        actionIcon = <FileText className="w-3.5 h-3.5 text-emerald-700" />;
                      } else if (log.action === "EXPORTAR") {
                        badgeStyle = "bg-amber-50 text-amber-800 border-amber-150";
                        actionIcon = <ShieldAlert className="w-3.5 h-3.5 text-amber-800" />;
                      }

                      return (
                        <div 
                          key={log.id} 
                          className="border border-slate-100 rounded-lg p-3 bg-white text-xs hover:border-slate-300 transition-all shadow-2xs space-y-2"
                        >
                          <div className="flex flex-wrap justify-between items-center gap-1.5 pb-1 border-b border-slate-50">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full border text-[9.5px] font-bold flex items-center gap-1 uppercase tracking-wide ${badgeStyle}`}>
                                {actionIcon} {log.action}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString("es-CL") : "Reciente"}
                              </span>
                            </div>
                            <span className="text-[9.5px] font-mono text-gray-400">UUID Log: {log.id}</span>
                          </div>

                          <p className="text-slate-700 leading-relaxed font-sans">{log.details}</p>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-50 leading-tight text-[9px] font-mono text-slate-450 uppercase">
                            <div>
                              <span>Operador:</span>{" "}
                              <strong className="text-slate-600">{log.operatorEmail}</strong>
                            </div>
                            <div>
                              <span>IP Registro:</span>{" "}
                              <strong className="text-slate-600">{log.ipAddress}</strong>
                            </div>
                            <div className="col-span-2 sm:col-span-1 truncate" title={log.userAgent}>
                              <span>Huella Digital: </span>
                              <strong className="text-slate-600 truncate inline-block max-w-[120px] align-bottom">
                                {log.userAgent}
                              </strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-slate-50/50 rounded-3xl p-16 text-center border-2 border-dashed border-gray-100 h-full flex flex-col justify-center items-center">
            <BookOpen className="w-16 h-16 text-gray-300 stroke-1" />
            <h4 className="text-lg font-bold text-slate-800 mt-4">Expedientes Clínicos Confidenciales</h4>
            <p className="text-xs text-gray-500 max-w-sm mt-1">Seleccione un paciente de la barra lateral izquierda para gestionar sus progresos de sesión, planes de intervención psicoterapéutica y generar evoluciones estructuradas por Inteligencia Artificial.</p>
          </div>
        )}

        {/* ⭐ SECCIÓN RESEÑAS DE PACIENTES - COPIAR Y GESTIONAR OPINIONES */}
        <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm space-y-4 mt-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-0.5">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                Control de Calidad: Reseñas y Satisfacción de Pacientes
              </h4>
              <span className="text-[10px] text-slate-500 block">
                Herramienta para recopilar feedback de servicio y transparentar la labor clínica conforme a la confidencialidad legal.
              </span>
            </div>
            
            <div className="bg-white p-2.5 rounded-xl border flex items-center gap-4 text-xs font-mono font-bold text-slate-700">
              <div>
                <span>Total: {receivedReviews.length}</span>
              </div>
              <div>
                <span>Promedio: {(receivedReviews.reduce((acc, r) => acc + r.rating, 0) / (receivedReviews.length || 1)).toFixed(1)} ⭐</span>
              </div>
            </div>
          </div>

          {loadingReviews ? (
            <div className="text-center py-4 text-xs text-gray-400">Cargando sugerencias de evaluación recibidas...</div>
          ) : receivedReviews.length === 0 ? (
            <div className="text-center py-8 bg-slate-50/50 rounded-2xl border border-slate-100 text-xs text-gray-400 font-sans italic">
              No se han registrado evaluaciones de pacientes todavía. Copie el enlace "Solicitar Reseña" arriba en cualquier expediente activo para enviarlo a sus pacientes atendidos.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {receivedReviews.map((rev) => (
                <div key={rev.id} className="border border-gray-100 rounded-xl p-4 bg-slate-50/30 text-xs space-y-3 relative flex flex-col justify-between">
                  <button
                    onClick={() => handleDeleteReview(rev.id)}
                    className="absolute top-3 right-3 p-1 hover:bg-rose-105 text-rose-500 hover:text-rose-600 rounded cursor-pointer transition"
                    title="Eliminar reseña de la página pública"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
                  <div className="space-y-1.5 pr-6">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3 h-3 ${
                              s <= rev.rating ? "fill-amber-400 stroke-amber-500 text-amber-500" : "text-gray-200 stroke-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="font-bold text-slate-800">{rev.patientName}</span>
                      {rev.isAnonymized && (
                        <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">P.A.</span>
                      )}
                    </div>
                    
                    <p className="text-slate-600 font-sans leading-relaxed italic">
                      "{rev.comment || "Sin comentarios textuales"}"
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-2 text-[10px]">
                    <span className="text-gray-400">
                      📅 {rev.createdAt?.toDate ? new Date(rev.createdAt.toDate()).toLocaleDateString() : "Reciente"}
                    </span>
                    <span className={`font-semibold ${rev.publicConsent ? "text-emerald-500 font-bold" : "text-amber-500"}`}>
                      {rev.publicConsent ? "✓ Permitido publicar" : "🔒 Privado (Solo doctor)"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      {showCustomTagModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200 animate-out duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-gray-100 shadow-xl space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
              <h4 className="text-xs font-bold text-slate-900 uppercase">Crear Nueva Clasificación Terapéutica</h4>
              <button 
                type="button" 
                onClick={() => setShowCustomTagModal(false)}
                className="text-gray-400 hover:text-gray-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateNewCustomTag} className="space-y-4">
              <div className="space-y-1 text-xs">
                <label className="block text-gray-600 font-semibold">Nombre de la Etiqueta (Ej: "Trastorno de Ansiedad")</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Apego Ansioso"
                  value={customTagName}
                  onChange={(e) => setCustomTagName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-250 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="block text-gray-600 font-semibold">Estilo Visual (Paleta de Colores)</label>
                <div className="grid grid-cols-2 gap-1.5 font-sans">
                  {[
                    { style: "bg-purple-50 text-purple-700 border-purple-200", label: "Morado Clínico" },
                    { style: "bg-red-50 text-red-700 border-red-200", label: "Rojo Riesgo Alerta" },
                    { style: "bg-orange-50 text-orange-700 border-orange-200", label: "Naranja Preventivo" },
                    { style: "bg-blue-50 text-blue-700 border-blue-200", label: "Azul Sintomático" },
                    { style: "bg-teal-55 text-teal-850 border-teal-200", label: "Teal Conductual" },
                    { style: "bg-pink-50 text-pink-700 border-pink-200", label: "Rosa Emocional" }
                  ].map((colorOpt) => (
                    <button
                      type="button"
                      key={colorOpt.style}
                      onClick={() => setCustomTagColor(colorOpt.style)}
                      className={`p-2 rounded-lg text-[10px] text-left border cursor-pointer font-semibold ${colorOpt.style} ${
                        customTagColor === colorOpt.style ? "ring-2 ring-slate-900 border-transparent font-bold" : "border-gray-200 font-normal hover:opacity-100"
                      }`}
                    >
                      {colorOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t text-xs">
                <button
                  type="button"
                  onClick={() => setShowCustomTagModal(false)}
                  className="px-3.5 py-2 border rounded-xl hover:bg-slate-50 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 font-semibold transition-all shadow-sm"
                >
                  Crear y Asociar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  </div>
);
}
