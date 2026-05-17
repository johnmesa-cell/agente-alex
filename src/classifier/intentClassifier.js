const EMERGENCY_KEYWORDS = [
  // Traumas físicos
  'quemadura', 'cortada', 'herida', 'sangrado', 'fractura', 'golpe', 'caída',
  'inconsciente', 'desmayo', 'no respira', 'atragantado', 'asfixia', 'ahogando',
  'convulsión', 'infarto', 'derrame', 'veneno', 'intoxicación', 'sobredosis',
  // Crisis de salud mental
  'suicidio', 'hacerme daño', 'no quiero vivir', 'crisis', 'pánico', 'ataque de pánico',
  'ansioso', 'no puedo respirar', 'me estoy muriendo',
  // Indicadores de urgencia
  'ayuda', 'emergencia', 'urgente', 'rápido', 'ahora', 'está pasando',
  'qué hago', 'qué hago si', 'cómo actúo'
];

const EMERGENCY_PATTERNS = [
  /se está (desmayando|ahogando|muriendo|cayendo)/i,
  /no (respira|reacciona|está consciente)/i,
  /mucho (sangrado|dolor|sangre)/i,
  /no puedo (respirar|moverme|hablar)/i,
  /qué hago (si|con|cuando)/i,
  /(me|le) (caí|golpeé|cortó|quemó)/i
];

/**
 * Clasifica la intención del mensaje como 'emergency' o 'consultation'
 * @param {string} message 
 * @returns {Promise<'emergency'|'consultation'>}
 */
export async function classifyIntent(message) {
  const lowerMessage = message.toLowerCase();

  // Verificar keywords de emergencia
  const hasKeyword = EMERGENCY_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword)
  );

  if (hasKeyword) return 'emergency';

  // Verificar patrones de emergencia
  const hasPattern = EMERGENCY_PATTERNS.some(pattern =>
    pattern.test(lowerMessage)
  );

  if (hasPattern) return 'emergency';

  return 'consultation';
}