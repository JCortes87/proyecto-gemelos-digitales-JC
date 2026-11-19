import { apiUrl, authHeaders } from "./api";

// INTERRUPTOR TEMPORAL: en false, elSpeak NUNCA llama a /speech/tts
// (ElevenLabs) y usa solo la voz gratuita del navegador (speechSynthesis).
// Evita consumir tokens de ElevenLabs durante la etapa de ajustes con
// recargas frecuentes. Volver a true para reactivar la voz de ElevenLabs.
const ELEVENLABS_ENABLED = false;

let _elCurrentAudio = null;
let _elToken = 0;            // token monotonico: identifica la reproduccion vigente
let _elController = null;    // AbortController del fetch /speech/tts en curso

export function elStop() {
  // Invalida cualquier reproduccion o carga en curso. Si un fetch lanzado
  // antes termina despues de este stop, su token ya no coincide y se descarta
  // (asi nunca suenan dos audios a la vez aunque se hagan clics rapidos).
  _elToken++;
  if (_elController) { try { _elController.abort(); } catch (_) { /* abort sobre un fetch ya terminado: nada que hacer */ } _elController = null; }
  if (_elCurrentAudio) { _elCurrentAudio.pause(); _elCurrentAudio = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// Auto-stop on navigation / tab hide so audio never overlaps across screens.
if (typeof window !== "undefined" && !window.__elNavHooked) {
  window.__elNavHooked = true;
  window.addEventListener("popstate", elStop);
  window.addEventListener("pagehide", elStop);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) elStop();
  });
  const _origPush = history.pushState;
  const _origReplace = history.replaceState;
  history.pushState = function (...args) { elStop(); return _origPush.apply(this, args); };
  history.replaceState = function (...args) { elStop(); return _origReplace.apply(this, args); };
}

function _browserSpeak(clean, myToken, onStart, onEnd) {
  if ("speechSynthesis" in window) {
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = "es-CO"; utt.rate = 0.92;
    const esV = window.speechSynthesis.getVoices().find(v => v.lang.startsWith("es"));
    if (esV) utt.voice = esV;
    utt.onend = utt.onerror = () => { if (myToken === _elToken) onEnd && onEnd(); };
    onStart && onStart();
    window.speechSynthesis.speak(utt);
  } else { onEnd && onEnd(); }
}

export async function elSpeak(rawText, onStart, onEnd) {
  if (!rawText || !rawText.trim()) return;
  elStop();
  const myToken = _elToken;
  const controller = new AbortController();
  _elController = controller;

  const clean = rawText
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "menor que").replace(/&gt;/g, "mayor que").replace(/&amp;/g, "y")
    // \p{ASCII} equivale al rango \u0000-\u007F sin escribir caracteres de control
    // en la regex; con /u los emojis se eliminan como un solo code point.
    .replace(/[^\p{ASCII}\u00C0-\u024F\u0400-\u04FF\s]/gu, "")
    .replace(/\[.*?\]/g, "").replace(/\s+/g, " ").trim().slice(0, 2000);

  // Con ElevenLabs desactivado no se toca /speech/tts: voz del navegador
  // directamente (gratis, sin tokens).
  if (!ELEVENLABS_ENABLED) {
    _elController = null;
    _browserSpeak(clean, myToken, onStart, onEnd);
    return;
  }

  try {
    const hdrs = { "Content-Type": "application/json", ...authHeaders() };
    const res = await fetch(apiUrl("/speech/tts"), {
      method: "POST", credentials: "include", headers: hdrs,
      body: JSON.stringify({ text: clean }),
      signal: controller.signal,
    });
    if (myToken !== _elToken) return;            // nos supero otra llamada / stop
    if (!res.ok) throw new Error("TTS " + res.status);
    const blob = await res.blob();
    if (myToken !== _elToken) return;            // re-chequeo tras descargar el audio
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _elCurrentAudio = audio;
    _elController = null;
    audio.onended = audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (myToken === _elToken) { _elCurrentAudio = null; onEnd && onEnd(); }
    };
    onStart && onStart();                        // onStart cuando el audio EMPIEZA a sonar
    audio.play();
    return audio;
  } catch (e) {
    // Cancelacion deliberada (stop o nueva llamada): no es un error real.
    if (e.name === "AbortError" || myToken !== _elToken) return;

    console.warn("ElevenLabs TTS fallback:", e.message);
    _browserSpeak(clean, myToken, onStart, onEnd);
  }
}

export async function elListen(onResult, onError) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "audio.webm");
      try {
        const hdrs = authHeaders();
        const res = await fetch(apiUrl("/speech/stt"), { method: "POST", credentials: "include", headers: hdrs, body: form });
        if (!res.ok) throw new Error("STT " + res.status);
        const data = await res.json();
        onResult && onResult(data.text || "");
      } catch (e) { onError && onError(e); }
    };
    recorder.start();
    setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 10000);
    return recorder;
  } catch (e) { onError && onError(e); }
}
