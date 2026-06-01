import React, { useState, useEffect } from "react";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { ShieldCheck, Star, Heart, CheckCircle2, ChevronRight, MessageSquare, UserCheck } from "lucide-react";

interface PatientEvaluationFormProps {
  patientId: string;
  therapistId: string;
  therapistName: string;
  initialPatientName: string;
  onFinished: () => void;
}

export default function PatientEvaluationForm({
  patientId,
  therapistId,
  therapistName,
  initialPatientName,
  onFinished,
}: PatientEvaluationFormProps) {
  const [patientName, setPatientName] = useState(initialPatientName || "");
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isAnonymized, setIsAnonymized] = useState(false);
  const [consentLawAccepted, setConsentLawAccepted] = useState(false);
  const [publicConsent, setPublicConsent] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const MAX_CHARACTERS = 300;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!consentLawAccepted) {
      setErrorMessage("Debe aceptar el tratamiento de datos y consentimiento informado bajo las normativas chilenas.");
      return;
    }

    if (rating < 1 || rating > 5) {
      setErrorMessage("Por favor, seleccione una calificación válida.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create review document matching standard entity
      const displayPatientName = isAnonymized 
        ? "Paciente Anónimo" 
        : (patientName.trim() || "Paciente");

      const reviewId = "review_" + Math.random().toString(36).substring(2, 11);
      const docData = {
        id: reviewId,
        patientName: displayPatientName,
        rating: Number(rating),
        comment: comment.trim(),
        consentLawAccepted: Boolean(consentLawAccepted),
        publicConsent: Boolean(publicConsent),
        isAnonymized: Boolean(isAnonymized),
        ownerId: therapistId,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, "reviews"), docData);
      setIsSuccess(true);
    } catch (err: any) {
      console.error("Error submitting rating form:", err);
      try {
        // Log details as per firebase integration guidelines
        handleFirestoreError(err, OperationType.WRITE, "reviews");
      } catch (logErr: any) {
        setErrorMessage("Ocurrió un error al enviar su evaluación comercial. Por favor verifique los campos.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl border border-gray-150 p-8 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="inline-flex justify-center items-center bg-emerald-50 text-emerald-555 p-5 rounded-full border border-emerald-100 shadow-sm">
          <CheckCircle2 className="w-14 h-14 text-emerald-600 animate-bounce" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">¡Evaluación Enviada Exitosamente!</h2>
          <p className="text-sm text-slate-600 leading-relaxed font-sans">
            Muchas gracias por su valiosa retroalimentación y tiempo para evaluar la calidad de la atención con <strong>{therapistName}</strong>. Su opinión contribuye directamente a mantener altos estándares sanitarios y profesionales.
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-left text-xs text-slate-500 font-sans space-y-1">
          <p className="font-bold text-slate-700 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-slate-600" /> Resguardo de Identidad Conforme a Derecho
          </p>
          <p>
            Su respuesta ha sido codificada y guardada de forma segura bajo las normas vigentes en Chile de confidencialidad de la información médica. No compartiremos su RUT, teléfono ni datos de diagnóstico con ningún tercero.
          </p>
        </div>
        <button
          onClick={onFinished}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider py-3.5 px-6 rounded-2xl transition-all cursor-pointer shadow-md inline-flex items-center gap-1.5"
        >
          Volver a la Página Principal
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded-3xl border border-gray-150 shadow-xl overflow-hidden animate-in fade-in duration-200">
      
      {/* Visual form banner banner */}
      <div className="bg-slate-900 p-6 text-white text-center space-y-2 relative">
        <div className="absolute right-3 top-3 opacity-10">
          <Heart className="w-16 h-16 animate-pulse" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">Evaluación de Calidad de Atención</h2>
        <p className="text-xs text-slate-400">Ayúdenos a mejorar compartiendo su experiencia clínica confidencial.</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 text-xs font-sans">
        
        {/* Dynamic metadata displays */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
          <div>
            <span className="block text-[8.5px] uppercase font-mono tracking-wider font-bold text-slate-400">Atendido por</span>
            <span className="text-xs font-bold text-slate-800 leading-snug">{therapistName}</span>
          </div>
          <div className="text-right">
            <span className="block text-[8.5px] uppercase font-mono tracking-wider font-bold text-slate-400">Ficha Clínico Vinculada</span>
            <span className="text-xs font-mono font-bold text-slate-600">{patientId || "Reservas Públicas"}</span>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-xl font-semibold">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* 1. Star Evaluator Selector */}
        <div className="space-y-2 text-center py-2 bg-slate-50/50 rounded-2xl border border-slate-100">
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            Califique el Profesionalismo del Servicio
          </label>
          <div className="flex justify-center items-center gap-2 mt-2">
            {[1, 2, 3, 4, 5].map((starVal) => {
              const active = hoverRating !== null ? starVal <= hoverRating : starVal <= rating;
              return (
                <button
                  key={starVal}
                  type="button"
                  onClick={() => setRating(starVal)}
                  onMouseEnter={() => setHoverRating(starVal)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1 cursor-pointer transition-all active:scale-90"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      active ? "fill-amber-450 stroke-amber-500 text-amber-500" : "text-gray-250 stroke-gray-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <p className="text-[10px] font-semibold text-slate-500 mt-1">
            {rating === 5 && "⭐ Excelente - Muy satisfecho(a)"}
            {rating === 4 && "⭐ Bueno - Satisfecho(a)"}
            {rating === 3 && "⭐ Aceptable - Con observaciones"}
            {rating === 2 && "⭐ Regular - Necesita mejorar"}
            {rating === 1 && "⭐ Insatisfecho(a) - Deficiente"}
          </p>
        </div>

        {/* 2. Patient Identity and Anonymity Options */}
        <div className="space-y-3.5">
          <div className="flex justify-between items-center pb-1 border-b border-gray-100">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-slate-600" /> Identidad del Paciente
            </label>
            <span className="text-[10px] text-gray-400">Opción de Anonimización Disponible</span>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-slate-500 block">Nombre del Evaluador en el Formulario</label>
              <input
                type="text"
                value={patientName}
                disabled={isAnonymized}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Ej. Constanza Silva"
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-[14px] text-slate-800 font-medium focus:ring-1 focus:ring-slate-900 disabled:opacity-50 placeholder-slate-400"
              />
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-start gap-2.5">
              <input
                type="checkbox"
                id="chk_anonymize"
                checked={isAnonymized}
                onChange={(e) => setIsAnonymized(e.target.checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <label htmlFor="chk_anonymize" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Deseo anonimizar mi identidad
                </label>
                <p className="text-[10px] text-gray-500 leading-tight">
                  Al activarlo, su reseña se guardará y mostrará bajo la etiqueta de <strong>"Paciente Anónimo"</strong> o <strong>"P.A."</strong> para proteger su absoluta intimidad familiar y laboral.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Review comment area with character limit & counter */}
        <div className="space-y-2">
          <div className="flex justify-between items-center pb-1 border-b border-gray-100">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-slate-600" /> Reseña Breve de la Atención
            </label>
            <span className={`text-[10.5px] font-mono font-bold ${comment.length > MAX_CHARACTERS ? "text-rose-500" : "text-gray-400"}`}>
              {comment.length} / {MAX_CHARACTERS}
            </span>
          </div>

          <p className="text-[10px] text-gray-400">Por favor, escriba una síntesis breve sobre la calidad de la terapia recibida y el acompañamiento:</p>

          <textarea
            value={comment}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARACTERS) {
                setComment(e.target.value);
              }
            }}
            placeholder="Ej. Una atención excelente. El terapeuta fue muy profesional, empático y acertado en las interpretaciones de mi proceso de ansiedad..."
            rows={4}
            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-[14px] text-slate-800 leading-relaxed focus:ring-1 focus:ring-slate-900 placeholder-slate-400"
            required
          />
        </div>

        {/* 4. Complete Chilean Law Informed Consent section */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-205 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-200 pb-1.5">
            <ShieldCheck className="w-4.5 h-4.5 text-slate-700" />
            <span className="uppercase text-[9.5px] tracking-wider">Consentimiento Informado (Normativa Leyes Chilenas)</span>
          </div>

          <p className="text-[10.5px] text-gray-500 leading-relaxed">
            De conformidad con la <strong>Ley N° 19.628 de Protección de la Vida Privada</strong> y la <strong>Ley N° 20.584</strong> sobre Derechos y Deberes de las Personas en Atención de Salud de la República de Chile, le informamos:
          </p>
          <ul className="list-disc pl-4 text-[10px] text-gray-500 space-y-1">
            <li>Sus datos de ficha y diagnósticos médicos se encuentran amparados bajo el <strong>secreto profesional</strong> y son absolutamente inviolables.</li>
            <li>Sus datos de contacto (correo y teléfono) serán utilizados exclusivamente para efectos de coordinación, confirmación y notificaciones administrativas de atención, <strong>sin fines comerciales ni publicitarios de ningún tipo</strong>.</li>
            <li>Tiene derecho en todo momento a rectificar, revocar o eliminar cualquier información personal ingresada en las bases locales de la clínica.</li>
            <li>La presente evaluación de servicio se recopila voluntariamente para transparentar la calidad y propiciar la mejora del servicio de salud otorgado.</li>
          </ul>

          <div className="space-y-2.5 pt-2 border-t border-slate-200">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="chk_consent_chile"
                checked={consentLawAccepted}
                onChange={(e) => setConsentLawAccepted(e.target.checked)}
                className="mt-0.5"
                required
              />
              <label htmlFor="chk_consent_chile" className="text-[10.5px] text-slate-700 font-semibold leading-tight cursor-pointer">
                He leído y consiento el tratamiento de mis datos de reseña según las normativas chilenas vigentes (Leyes 19.628 y 20.584). *
              </label>
            </div>

            <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-xl border border-slate-100">
              <input
                type="checkbox"
                id="chk_consent_public"
                checked={publicConsent}
                onChange={(e) => setPublicConsent(e.target.checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <label htmlFor="chk_consent_public" className="text-[10.5px] text-slate-700 font-semibold cursor-pointer">
                  Autorizo publicar esta reseña en la página del portal clínico
                </label>
                <p className="text-[9.5px] text-gray-400">
                  Al marcar esta casilla, autoriza que el comentario y la puntuación se exhiban públicamente en el carrusel de opiniones médicas para orientar a otros pacientes que buscan agendar.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onFinished}
            className="w-full sm:w-auto px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-500 font-semibold rounded-xl text-center"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-slate-900 border border-slate-950 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all uppercase"
          >
            {isSubmitting ? "Enviando..." : "Enviar Evaluación"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </form>
    </div>
  );
}
