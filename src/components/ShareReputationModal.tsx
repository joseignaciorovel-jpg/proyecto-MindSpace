import React, { useState, useEffect } from "react";
import { X, Copy, Check, Mail, MessageSquare, ShieldCheck, FileText, CheckCircle2, Star, Sparkles, Send } from "lucide-react";

interface ShareReputationModalProps {
  isOpen: boolean;
  onClose: () => void;
  therapistName: string;
  therapistEmail: string;
}

export default function ShareReputationModal({
  isOpen,
  onClose,
  therapistName,
  therapistEmail,
}: ShareReputationModalProps) {
  // Setup dynamic base URL & feedback share link
  const [shareUrl, setShareUrl] = useState("");
  const [webReservaUrl, setWebReservaUrl] = useState("");
  
  // Custom draft text message the user can edit before sending
  const [messageText, setMessageText] = useState("");
  
  const [hasConsent, setHasConsent] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  
  // Message presets template selection
  const [selectedPreset, setSelectedPreset] = useState<"preset1" | "preset2">("preset1");

  const nameForGreeting = therapistName || "José Romero";
  
  const preset1 = `Hola, te escribo con el motivo de que estoy construyendo mi consultorio digital y me resultaría muy valioso tu testimonio para consolidar mi reputación profesional y dar mayor credibilidad. Te agradecería un breve momento de tu tiempo para responder este breve formulario confidencial.

Puedes ver dónde quedará alojado el testimonio en mi página de reserva aquí: ${webReservaUrl || "mi web de reservas"}

Agradezco de antemano por tu inmensa confianza y el apoyo incondicional.

Me despido afectuosamente,
${nameForGreeting}`;

  const preset2 = `Hola, soy ${nameForGreeting.replace("Ps. ", "")}. Nos conocimos en algún momento de nuestro camino profesional/terapéutico; hoy te escribo para pedirte un tremendo favor. Resulta que actualmente estoy construyendo mi propio consultorio digital y me resultaría muy valiosa tu opinión sobre mi labor para dar mayor robustez a mi reputación.

Puedes ver la web de reserva actual para comprobar dónde se presenta en: ${webReservaUrl || "mi web de reservas"}

Muchas gracias por la confianza y el apoyo.

Se despide cordialmente,
${therapistName || "José Romero Velásquez"}`;

  // Update share link and message payload when modal opens or inputs change
  useEffect(() => {
    const productionOrigin = "https://proyecto-mindspace-597030236952.southamerica-west1.run.app";
    const sanitizedTherapistName = encodeURIComponent(therapistName || "Ps. José Ignacio Romero Velásquez");
    const link = `${productionOrigin}/?mode=review&therapistId=default_psychologist_uid_123&therapistName=${sanitizedTherapistName}`;
    setShareUrl(link);
    setWebReservaUrl(productionOrigin);
  }, [therapistName]);

  // Handle active preset message syncing
  useEffect(() => {
    if (selectedPreset === "preset1") {
      setMessageText(preset1);
    } else {
      setMessageText(preset2);
    }
  }, [selectedPreset, therapistName, webReservaUrl]);

  if (!isOpen) return null;

  // URL Encode body to pass to native share channels
  const getFullShareMessage = () => {
    return `${messageText}\n\n👉 Enlace para evaluar: ${shareUrl}`;
  };

  const handleCopyLinkOnly = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.error("Could not copy link:", err);
    }
  };

  const handleCopyFullText = async () => {
    try {
      await navigator.clipboard.writeText(getFullShareMessage());
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2500);
    } catch (err) {
      console.error("Could not copy message:", err);
    }
  };

  // WhatsApp share
  const handleShareWhatsApp = () => {
    if (!hasConsent) return;
    const fullText = getFullShareMessage();
    const encodedText = encodeURIComponent(fullText);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // Email share
  const handleShareEmail = () => {
    if (!hasConsent) return;
    const subject = encodeURIComponent("Invitación a Opinión Profesional - Consultorio Digital de " + (therapistName || "José Romero"));
    const body = encodeURIComponent(getFullShareMessage());
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, "_self");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      {/* Background click handler */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div 
        id="share_reputation_modal"
        className="relative bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-850 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden p-6 text-left animate-in fade-in zoom-in-95 duration-200 z-10 font-sans"
      >
        {/* Header Block */}
        <div className="flex justify-between items-start border-b border-gray-100 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 dark:bg-teal-950/45 text-teal-600 dark:text-teal-400 font-extrabold text-[9.5px] uppercase tracking-wider rounded-lg border border-teal-200/50 dark:border-teal-900/40">
              <Sparkles className="w-3 h-3" /> Reputación Profesional Ampliada
            </span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Compartir Formulario de Reputación
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Recoge testimonios de pacientes atendidos de forma externa para potenciar tu credibilidad.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-5 py-4">
          
          {/* Preset templates selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Seleccionar Plantilla de Mensaje
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedPreset("preset1")}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                  selectedPreset === "preset1"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-xs"
                    : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border-gray-255 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                1. Propuesta de Testimonio
              </button>
              <button
                type="button"
                onClick={() => setSelectedPreset("preset2")}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                  selectedPreset === "preset2"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-xs"
                    : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border-gray-255 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                2. Contacto de Confianza
              </button>
            </div>
          </div>

          {/* Large Editable Text Area representing the personalized template message */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Mensaje de Invitación
              </label>
              <button
                type="button"
                onClick={handleCopyFullText}
                className="text-[10px] text-teal-600 dark:text-teal-400 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedMessage ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" /> ¡Mensaje Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copiar Mensaje Completo
                  </>
                )}
              </button>
            </div>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={6}
              className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60 text-slate-800 dark:text-slate-200 font-sans focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all leading-normal"
              placeholder="Escribe un mensaje de invitación personalizado..."
            />
          </div>

          {/* Share Link Preview with Copiar Vinculo block */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-gray-150 dark:border-slate-800 flex justify-between items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-mono uppercase text-[#0EA5E9] font-bold tracking-widest leading-none mb-1">
                  Enlace del Formulario (Evaluación)
                </span>
                <p className="text-[10px] font-mono text-slate-650 dark:text-slate-350 truncate">
                  {shareUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyLinkOnly}
                className="py-1 px-2.5 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-gray-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 font-bold text-[9.5px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              >
                {copiedLink ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-gray-150 dark:border-slate-800 flex justify-between items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-mono uppercase text-teal-600 dark:text-teal-400 font-bold tracking-widest leading-none mb-1">
                  Tu Web Reserva (Muestra)
                </span>
                <p className="text-[10px] font-mono text-slate-650 dark:text-slate-350 truncate">
                  {webReservaUrl}
                </p>
              </div>
              <a
                href={webReservaUrl}
                target="_blank"
                rel="noreferrer"
                className="py-1 px-2.5 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-gray-200 dark:border-slate-800 text-teal-600 dark:text-teal-400 font-bold text-[9.5px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              >
                Ver Sitio
              </a>
            </div>
          </div>

          {/* Privacy approved checkbox & approval policies, as explicitly requested */}
          <div className="p-3 bg-teal-50/30 dark:bg-teal-950/10 border border-teal-100/50 dark:border-teal-900/40 rounded-xl">
            <label className="flex items-start gap-2.5 cursor-pointer selection:bg-transparent">
              <input
                type="checkbox"
                checked={hasConsent}
                onChange={(e) => setHasConsent(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 dark:bg-slate-950 dark:border-slate-800 h-3.5 w-3.5"
              />
              <span className="text-[10.5px]/relaxed text-slate-700 dark:text-slate-300 font-medium">
                📋 Consiento los términos y políticas de resguardo de información. <strong>No se almacena información sensible de contactos ni datos personales</strong>, utilizándose el vínculo únicamente con fines de recolección transparente de reputación profesional digital. Conforme a derecho.
              </span>
            </label>
          </div>

          {/* Action Channels styled horizontally as requested by the first image (WhatsApp, Gmail, Copy, etc.) */}
          <div className="space-y-2 border-t border-gray-100 dark:border-slate-850 pt-4 text-center">
            <span className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Selecciona Canal para Compartir
            </span>
            
            <div className="flex justify-center items-center gap-8 py-2">
              {/* WhatsApp Option (Green circle) */}
              <button
                type="button"
                onClick={handleShareWhatsApp}
                disabled={!hasConsent}
                title={hasConsent ? "Enviar por WhatsApp" : "Acepte la política primero"}
                className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
                  hasConsent ? "cursor-pointer hover:scale-105 active:scale-95 text-slate-800 dark:text-slate-100" : "opacity-40 cursor-not-allowed text-slate-400"
                }`}
              >
                <div className="w-12 h-12 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md border hover:border-emerald-500/50">
                  <MessageSquare className="w-6 h-6 fill-white text-emerald-500" />
                </div>
                <span className="text-[10.5px] font-bold">WhatsApp</span>
              </button>

              {/* Email / Gmail Option (Red/amber circle) */}
              <button
                type="button"
                onClick={handleShareEmail}
                disabled={!hasConsent}
                title={hasConsent ? "Enviar por Correo" : "Acepte la política primero"}
                className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
                  hasConsent ? "cursor-pointer hover:scale-105 active:scale-95 text-slate-800 dark:text-slate-100" : "opacity-40 cursor-not-allowed text-slate-400"
                }`}
              >
                <div className="w-12 h-12 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md border hover:border-red-500/50">
                  <Mail className="w-5 h-5" />
                </div>
                <span className="text-[10.5px] font-bold">Correo</span>
              </button>

              {/* Copy Message Option (Teal circle) */}
              <button
                type="button"
                onClick={handleCopyFullText}
                disabled={!hasConsent}
                title={hasConsent ? "Copiar texto listo para pegar" : "Acepte la política primero"}
                className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
                  hasConsent ? "cursor-pointer hover:scale-105 active:scale-95 text-slate-800 dark:text-slate-100" : "opacity-40 cursor-not-allowed text-slate-400"
                }`}
              >
                <div className="w-12 h-12 bg-teal-500 hover:bg-teal-600 text-white rounded-full flex items-center justify-center shadow-md border hover:border-teal-500/50">
                  {copiedMessage ? <Check className="w-5 h-5 text-white" /> : <Copy className="w-5 h-5" />}
                </div>
                <span className="text-[10.5px] font-bold">Copiar Todo</span>
              </button>
            </div>

            {!hasConsent && (
              <p className="text-[10px] text-red-500 dark:text-red-450 font-semibold animate-pulse mt-1">
                ⚠ Debe marcar la casilla de aprobación de resguardo profesional para habilitar el uso y envío de enlaces.
              </p>
            )}
          </div>

        </div>

        {/* Footer info/consent layout */}
        <div className="border-t border-slate-100 dark:border-slate-850 pt-3 text-center">
          <p className="text-[9.5px] text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" /> Consultorio Digital Seguro • Resguardo Ético del Paciente
          </p>
        </div>
      </div>
    </div>
  );
}
