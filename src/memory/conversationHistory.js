// Almacenamiento en memoria por sesión
// En producción futura se puede migrar a Redis para persistencia entre reinicios
const sessions = new Map();

const MAX_HISTORY_LENGTH = 20; // Máximo de mensajes por sesión (10 turnos)

/**
 * Obtiene el historial de conversación de una sesión
 * @param {string} sessionId
 * @returns {Array<{role: string, content: string}>}
 */
export function getConversationHistory(sessionId) {
  return sessions.get(sessionId) || [];
}

/**
 * Agrega un mensaje al historial de una sesión
 * @param {string} sessionId
 * @param {{role: string, content: string}} message
 */
export function addToHistory(sessionId, message) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }

  const history = sessions.get(sessionId);
  history.push(message);

  // Mantener solo los últimos MAX_HISTORY_LENGTH mensajes
  // para no exceder el contexto del modelo
  if (history.length > MAX_HISTORY_LENGTH) {
    history.splice(0, history.length - MAX_HISTORY_LENGTH);
  }
}

/**
 * Elimina el historial completo de una sesión
 * @param {string} sessionId
 */
export function clearHistory(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Retorna todas las sesiones activas (útil para debug y admin panel)
 * @returns {Array<string>}
 */
export function getActiveSessions() {
  return Array.from(sessions.keys());
}

/**
 * Limpia sesiones inactivas después de un tiempo definido
 * Se puede llamar periódicamente para liberar memoria
 * @param {number} maxAgeMs - Tiempo máximo de inactividad en milisegundos
 */
const sessionTimestamps = new Map();

export function touchSession(sessionId) {
  sessionTimestamps.set(sessionId, Date.now());
}

export function cleanupInactiveSessions(maxAgeMs = 30 * 60 * 1000) {
  const now = Date.now();
  for (const [sessionId, timestamp] of sessionTimestamps.entries()) {
    if (now - timestamp > maxAgeMs) {
      clearHistory(sessionId);
      sessionTimestamps.delete(sessionId);
      console.log(`Sesión eliminada por inactividad: ${sessionId}`);
    }
  }
}

// Limpieza automática cada 15 minutos
setInterval(() => cleanupInactiveSessions(), 15 * 60 * 1000);